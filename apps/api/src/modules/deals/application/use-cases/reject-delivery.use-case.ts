import { Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { ResourceConflictError } from '@/core/errors/domain-error';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { OutboxRepository } from '@/shared/application/ports/outbox.repository';
import { TransactionRunner } from '@/shared/application/transaction';
import type { Deal } from '../../domain/deal';
import type { Delivery } from '../../domain/delivery';
import { RejectionReasonRequiredError } from '../../domain/errors';
import { STATE_CHANGE_BODY } from '../../domain/message';
import {
  DeliveriesRepository,
  MessagesRepository,
} from '../ports/conversation.repository';
import { DealsRepository } from '../ports/deals.repository';
import { requireBuyer, requireParticipant } from './deal-access';

export interface RejectDeliveryInput {
  actorUserId: string;
  dealId: string;
  reason: string;
  /** A versão que o comprador tinha à frente quando decidiu rejeitar. */
  expectedVersion?: number;
}

/**
 * T11 — o comprador rejeita a entrega e o trabalho volta ao criador.
 *
 * O dinheiro não se mexe: continua retido, que é exactamente para isto que lá
 * está. Consome uma revisão das incluídas na oferta e abre prazo novo; sem
 * revisões, o caminho é a disputa e não a insistência (RN-044).
 */
@Injectable()
export class RejectDeliveryUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly deals: DealsRepository,
    private readonly deliveries: DeliveriesRepository,
    private readonly messages: MessagesRepository,
    private readonly outbox: OutboxRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: RejectDeliveryInput): Promise<{ deal: Deal; delivery: Delivery }> {
    const now = this.clock.now();
    const reason = input.reason?.trim() ?? '';

    if (!reason) {
      throw new RejectionReasonRequiredError();
    }

    return this.transactions.run(async (tx) => {
      const found = await this.deals.findById(input.dealId, tx);
      const deal = requireBuyer(
        requireParticipant(found, input.actorUserId, input.dealId),
        input.actorUserId,
      );

      const delivery = await this.deliveries.findLatest(deal.id, tx);

      if (
        delivery &&
        input.expectedVersion !== undefined &&
        delivery.version !== input.expectedVersion
      ) {
        throw new ResourceConflictError(
          'A entrega mudou. Abre a versão mais recente antes de responder.',
        );
      }

      // A ordem importa: a entidade é que decide se ainda há revisões, e uma
      // rejeição recusada não pode deixar a entrega marcada como rejeitada.
      // É também a entidade que recusa rejeitar o que não foi entregue — sem
      // entrega submetida o estado nunca é `DELIVERED`, e o erro certo é o de
      // transição inválida, não um conflito de versões.
      deal.rejectDelivery(now);

      if (!delivery) {
        throw new ResourceConflictError('Não há entrega nenhuma para rejeitar.');
      }

      await this.deliveries.markRejected(delivery.id, now, reason, tx);

      // O que sai do caso de uso é a entrega **depois** da rejeição: devolver a
      // leitura anterior mostraria ao comprador uma entrega por responder que
      // ele acabou de responder.
      const rejeitada: Delivery = { ...delivery, rejectedAt: now, rejectionReason: reason };

      await this.deals.save(deal, tx);

      await this.messages.create(
        {
          id: this.ids.next(),
          dealId: deal.id,
          senderUserId: input.actorUserId,
          kind: 'TEXT',
          body: reason,
          clientId: null,
          createdAt: now,
        },
        tx,
      );

      await this.messages.create(
        {
          id: this.ids.next(),
          dealId: deal.id,
          senderUserId: null,
          kind: 'STATE_CHANGE',
          body: STATE_CHANGE_BODY.DELIVERY_REJECTED,
          clientId: null,
          createdAt: now,
        },
        tx,
      );

      await this.outbox.enqueue(
        {
          type: 'delivery.rejected',
          payload: {
            dealId: deal.id,
            deliveryId: delivery.id,
            version: delivery.version,
            revisionsRemaining: deal.revisionsRemaining,
          },
          availableAt: now,
        },
        tx,
      );

      await this.auditLog.record(
        {
          actorUserId: input.actorUserId,
          actorKind: 'USER',
          action: 'delivery.rejected',
          subjectType: 'Deal',
          subjectId: deal.id,
          metadata: { version: delivery.version, revisionCount: deal.revisionCount },
        },
        tx,
      );

      return { deal, delivery: rejeitada };
    });
  }
}
