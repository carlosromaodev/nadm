import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { UsersRepository } from '@/modules/identity/application/ports/identity.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { TransactionRunner } from '@/shared/application/transaction';
import { NotificationChannel } from '../ports/notification-channel';
import { DeliveriesLog, OutboxQueue, type PendingEvent } from '../ports/notifications.repository';
import { deliverableAt, type NotificationPlan } from '../../domain/notification';
import { NotificationPlanner } from './notification-planner';

const MINUTO = 60 * 1000;

/** Depois de tantas tentativas, o evento deixa de ser tentado e fica no painel. */
const MAX_TENTATIVAS = 6;

export interface DispatchResult {
  /** Eventos retirados da fila e dados por tratados. */
  processed: number;
  /** Notificações que saíram de facto. */
  sent: number;
  /** Eventos adiados por causa do silêncio nocturno. */
  deferred: number;
  failed: number;
}

/**
 * O trabalhador que consome `outbox_events`.
 *
 * Desde F1 que cada transição escreve na fila **dentro da transacção** que muda
 * o estado, e é isso que garante que uma transacção revertida não notifica
 * ninguém — o evento nunca chega a existir. Isto é a outra ponta: consome,
 * envia e marca.
 *
 * Cada evento é tratado na sua própria transacção. Um que falhe não leva atrás
 * os outros, e volta a ser tentado com recuo crescente.
 */
@Injectable()
export class DispatchOutboxUseCase {
  private readonly logger = new Logger(DispatchOutboxUseCase.name);

  constructor(
    private readonly transactions: TransactionRunner,
    private readonly queue: OutboxQueue,
    private readonly deliveries: DeliveriesLog,
    private readonly planner: NotificationPlanner,
    private readonly channel: NotificationChannel,
    private readonly users: UsersRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: { limit?: number } = {}): Promise<DispatchResult> {
    const now = this.clock.now();
    const result: DispatchResult = { processed: 0, sent: 0, deferred: 0, failed: 0 };

    for (const event of await this.queue.claimBatch(now, input.limit ?? 100)) {
      // SDD §14.3 — o silêncio é adiar, não descartar. Só o dinheiro e a
      // disputa atravessam a noite.
      const saida = deliverableAt(now, event.type);

      if (saida > now) {
        await this.queue.markFailed(event.id, 'silêncio nocturno', saida);
        result.deferred += 1;
        continue;
      }

      try {
        result.sent += await this.dispatch(event, now);
        result.processed += 1;
      } catch (error) {
        result.failed += 1;
        await this.retry(event, error as Error, now);
      }
    }

    return result;
  }

  private async dispatch(event: PendingEvent, now: Date): Promise<number> {
    const planos = await this.planner.plan(event);

    let enviadas = 0;

    for (const plano of planos) {
      if (await this.deliver(event, plano, now)) enviadas += 1;
    }

    await this.queue.markProcessed(event.id, now);

    return enviadas;
  }

  private async deliver(
    event: PendingEvent,
    plano: NotificationPlan,
    now: Date,
  ): Promise<boolean> {
    const [canal] = plano.channels;
    const user = await this.users.findById(plano.recipientUserId);

    // Uma conta suspensa não é notificada: a plataforma fechou-lhe a porta, e
    // continuar a escrever-lhe seria falar sozinha.
    if (!user || user.status !== 'ACTIVE') return false;

    // A gravação vem **antes** do envio, de propósito. Entre gravar e enviar
    // pode falhar tudo, e o pior que acontece é uma notificação perdida; pela
    // ordem contrária, o pior era a mesma notificação duas vezes.
    const novo = await this.transactions.run((tx) =>
      this.deliveries.recordIfNew(
        {
          id: this.ids.next(),
          outboxEventId: event.id,
          recipientUserId: plano.recipientUserId,
          channel: canal,
          template: plano.template,
          idempotencyKey: plano.idempotencyKey,
          provider: this.channel.provider,
          providerReference: null,
          sentAt: now,
        },
        tx,
      ),
    );

    if (!novo) return false;

    await this.channel.send({
      kind: canal,
      to: {
        userId: user.id,
        phone: user.phone,
        email: user.email,
        displayName: user.displayName,
      },
      template: plano.template,
      data: plano.data,
      idempotencyKey: plano.idempotencyKey,
    });

    return true;
  }

  private async retry(event: PendingEvent, error: Error, now: Date): Promise<void> {
    const tentativas = event.attempts + 1;

    if (tentativas >= MAX_TENTATIVAS) {
      // Desistir em silêncio seria perder o evento. Fica por processar, e a
      // reconciliação conta-o em `eventosPorProcessar`.
      this.logger.error(
        `Evento ${event.id} (${event.type}) falhou ${tentativas} vezes e fica parado.`,
      );
    }

    // Recuo exponencial, com tecto: 1, 2, 4, 8, 16, 32 minutos.
    const espera = Math.min(2 ** (tentativas - 1), 32) * MINUTO;

    await this.queue.markFailed(event.id, error.message, new Date(now.getTime() + espera));
  }
}
