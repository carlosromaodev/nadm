import { Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { OutboxRepository } from '@/shared/application/ports/outbox.repository';
import { PricingPolicy } from '@/shared/application/ports/pricing-policy';
import { TransactionRunner } from '@/shared/application/transaction';
import type { Deal } from '../../domain/deal';
import { STATE_CHANGE_BODY } from '../../domain/message';
import { MessagesRepository } from '../ports/conversation.repository';
import { DealsRepository } from '../ports/deals.repository';
import { requireBuyer, requireParticipant } from './deal-access';
import { EscrowRefundService } from './escrow-refund';

export interface RequestRefundInput {
  actorUserId: string;
  dealId: string;
}

/**
 * T16 — o prazo de entrega foi ultrapassado e o comprador quer o dinheiro de
 * volta.
 *
 * O direito nasce do tempo, mas a devolução não é automática: é o comprador que
 * a pede. Um criador atrasado que entregue antes do pedido continua a receber —
 * é a diferença entre um prazo falhado e um negócio falhado.
 */
@Injectable()
export class RequestRefundUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly deals: DealsRepository,
    private readonly messages: MessagesRepository,
    private readonly escrow: EscrowRefundService,
    private readonly outbox: OutboxRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly ids: IdGenerator,
    private readonly pricing: PricingPolicy,
    private readonly clock: Clock,
  ) {}

  async execute(input: RequestRefundInput): Promise<Deal> {
    const now = this.clock.now();

    return this.transactions.run(async (tx) => {
      const found = await this.deals.findById(input.dealId, tx);
      const deal = requireBuyer(
        requireParticipant(found, input.actorUserId, input.dealId),
        input.actorUserId,
      );

      deal.assertRefundableForLateDeliveryAt(now, this.pricing.lateDeliveryGraceHours());

      deal.refund(now);

      await this.messages.create(
        {
          id: this.ids.next(),
          dealId: deal.id,
          senderUserId: null,
          kind: 'STATE_CHANGE',
          body: STATE_CHANGE_BODY.REFUND_REQUESTED,
          clientId: null,
          createdAt: now,
        },
        tx,
      );

      await this.escrow.closeEscrow(
        {
          deal,
          cause: 'deal.late_delivery',
          actorUserId: input.actorUserId,
          actorKind: 'USER',
        },
        now,
        tx,
      );

      await this.deals.save(deal, tx);

      await this.outbox.enqueue(
        {
          type: 'deal.refunded',
          payload: {
            dealId: deal.id,
            creatorProfileId: deal.creatorProfileId,
            cause: 'deal.late_delivery',
          },
          availableAt: now,
        },
        tx,
      );

      await this.auditLog.record(
        {
          actorUserId: input.actorUserId,
          actorKind: 'USER',
          action: 'deal.refunded',
          subjectType: 'Deal',
          subjectId: deal.id,
          metadata: {
            cause: 'deal.late_delivery',
            dueAt: deal.dueAt?.toISOString() ?? null,
          },
        },
        tx,
      );

      return deal;
    });
  }
}
