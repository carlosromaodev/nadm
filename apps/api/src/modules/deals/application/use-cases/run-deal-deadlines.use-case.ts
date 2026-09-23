import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { PaymentIntentsRepository } from '@/modules/payments/application/ports/payments.repository';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { OutboxRepository } from '@/shared/application/ports/outbox.repository';
import { PricingPolicy } from '@/shared/application/ports/pricing-policy';
import { TransactionRunner } from '@/shared/application/transaction';
import { STATE_CHANGE_BODY } from '../../domain/message';
import { MessagesRepository } from '../ports/conversation.repository';
import { DealsRepository } from '../ports/deals.repository';
import { ApproveDeliveryUseCase } from './approve-delivery.use-case';
import { EscrowRefundService } from './escrow-refund';
import { SlotReleaseService } from './slot-release';

export interface RunDealDeadlinesInput {
  /** Tecto por varrimento, para uma acumulação não engolir o processo. */
  limit?: number;
}

export interface RunDealDeadlinesResult {
  /** T13 — propostas que passaram o prazo de resposta do criador. */
  expired: number;
  /** T10 — entregas aprovadas por falta de resposta do comprador. */
  autoApproved: number;
  /** Pedidos que falharam e ficam para o varrimento seguinte. */
  failed: number;
}

const DEFAULT_LIMIT = 100;

/**
 * T13 e T10 — as duas transições que ninguém acciona.
 *
 * Cada pedido corre na sua própria transacção, de propósito: um `Deal` que
 * falhe não pode levar atrás os que já foram tratados. O varrimento seguinte
 * apanha-o, porque a condição que o seleccionou continua verdadeira — é o que
 * torna a tarefa retomável sem guardar estado nenhum sobre si própria.
 *
 * Não tem relógio próprio: lê o `Clock` injectado, e é por isso que um teste
 * avança 72 horas sem esperar 72 horas.
 */
@Injectable()
export class RunDealDeadlinesUseCase {
  private readonly logger = new Logger(RunDealDeadlinesUseCase.name);

  constructor(
    private readonly transactions: TransactionRunner,
    private readonly deals: DealsRepository,
    private readonly messages: MessagesRepository,
    private readonly intents: PaymentIntentsRepository,
    private readonly escrow: EscrowRefundService,
    private readonly slots: SlotReleaseService,
    private readonly approveDelivery: ApproveDeliveryUseCase,
    private readonly outbox: OutboxRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly ids: IdGenerator,
    private readonly pricing: PricingPolicy,
    private readonly clock: Clock,
  ) {}

  async execute(input: RunDealDeadlinesInput = {}): Promise<RunDealDeadlinesResult> {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const result: RunDealDeadlinesResult = { expired: 0, autoApproved: 0, failed: 0 };

    for (const deal of await this.deals.listExpiredProposals(this.clock.now(), limit)) {
      try {
        await this.expire(deal.id);
        result.expired += 1;
      } catch (error) {
        result.failed += 1;
        this.logger.error(`Falhou a expiração do pedido ${deal.id}`, error as Error);
      }
    }

    const deliveredBefore = new Date(
      this.clock.now().getTime() - this.pricing.approvalWindowHours() * 60 * 60 * 1000,
    );

    for (const deal of await this.deals.listPendingAutoApproval(deliveredBefore, limit)) {
      try {
        await this.approveDelivery.execute({ actorUserId: null, dealId: deal.id });
        result.autoApproved += 1;
      } catch (error) {
        result.failed += 1;
        this.logger.error(`Falhou a aprovação automática do pedido ${deal.id}`, error as Error);
      }
    }

    return result;
  }

  /** T13 — o prazo de resposta do criador esgotou-se, com ou sem dinheiro retido. */
  private async expire(dealId: string): Promise<void> {
    const now = this.clock.now();

    await this.transactions.run(async (tx) => {
      // Relê dentro da transacção: entre a listagem e agora, o criador pode ter
      // aceitado. `expire` recusa-se a expirar o que já não está por decidir.
      const deal = await this.deals.findById(dealId, tx);

      if (!deal || !deal.hasExpiredAt(now)) {
        return;
      }

      deal.expire(now);

      await this.messages.create(
        {
          id: this.ids.next(),
          dealId: deal.id,
          senderUserId: null,
          kind: 'STATE_CHANGE',
          body: STATE_CHANGE_BODY.EXPIRED,
          clientId: null,
          createdAt: now,
        },
        tx,
      );

      const closure = await this.escrow.closeEscrow(
        { deal, cause: 'deal.expired', actorUserId: null, actorKind: 'SYSTEM' },
        now,
        tx,
      );

      if (closure === 'never_funded') {
        await this.intents.expireActiveByDeal(deal.id, now, tx);
      }

      await this.slots.releaseFor(deal, tx);

      await this.deals.save(deal, tx);

      await this.outbox.enqueue(
        {
          type: 'deal.expired',
          payload: {
            dealId: deal.id,
            buyerUserId: deal.buyerUserId,
            creatorProfileId: deal.creatorProfileId,
            refunded: closure === 'refunded',
          },
          availableAt: now,
        },
        tx,
      );

      await this.auditLog.record(
        {
          actorUserId: null,
          actorKind: 'SYSTEM',
          action: 'deal.expired',
          subjectType: 'Deal',
          subjectId: deal.id,
          metadata: { escrow: closure },
        },
        tx,
      );
    });
  }
}
