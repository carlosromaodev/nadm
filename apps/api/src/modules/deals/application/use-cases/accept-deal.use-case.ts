import { Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { OutboxRepository } from '@/shared/application/ports/outbox.repository';
import { TransactionRunner } from '@/shared/application/transaction';
import type { Deal } from '../../domain/deal';
import { STATE_CHANGE_BODY } from '../../domain/message';
import { MessagesRepository } from '../ports/conversation.repository';
import { DealsRepository } from '../ports/deals.repository';
import { requireCreator, requireParticipant } from './deal-access';

export interface AcceptDealInput {
  actorUserId: string;
  dealId: string;
}

/** T2 — o criador aceita. A partir daqui há um pagamento por fazer. */
@Injectable()
export class AcceptDealUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly deals: DealsRepository,
    private readonly messages: MessagesRepository,
    private readonly outbox: OutboxRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: AcceptDealInput): Promise<Deal> {
    const now = this.clock.now();

    return this.transactions.run(async (tx) => {
      const found = await this.deals.findById(input.dealId, tx);
      const deal = requireCreator(
        requireParticipant(found, input.actorUserId, input.dealId),
        input.actorUserId,
      );

      deal.accept(now);

      await this.deals.save(deal, tx);

      await this.messages.create(
        {
          id: this.ids.next(),
          dealId: deal.id,
          senderUserId: null,
          kind: 'STATE_CHANGE',
          body: STATE_CHANGE_BODY.ACCEPTED,
          clientId: null,
          createdAt: now,
        },
        tx,
      );

      await this.outbox.enqueue(
        {
          type: 'deal.accepted',
          payload: { dealId: deal.id, buyerUserId: deal.buyerUserId },
          availableAt: now,
        },
        tx,
      );

      await this.auditLog.record(
        {
          actorUserId: input.actorUserId,
          actorKind: 'USER',
          action: 'deal.accepted',
          subjectType: 'Deal',
          subjectId: deal.id,
        },
        tx,
      );

      return deal;
    });
  }
}
