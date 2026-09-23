import { Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { BusinessRuleError } from '@/core/errors/domain-error';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { OutboxRepository } from '@/shared/application/ports/outbox.repository';
import { TransactionRunner } from '@/shared/application/transaction';
import type { Deal } from '../../domain/deal';
import type { Delivery } from '../../domain/delivery';
import { STATE_CHANGE_BODY } from '../../domain/message';
import {
  DeliveriesRepository,
  MessagesRepository,
} from '../ports/conversation.repository';
import { DealsRepository } from '../ports/deals.repository';
import { requireCreator, requireParticipant } from './deal-access';

export interface SubmitDeliveryInput {
  actorUserId: string;
  dealId: string;
  note: string;
}

/**
 * T8 — o criador entrega.
 *
 * Em F1 a entrega é a nota. Os ficheiros chegam em F3, e é aí que passa a valer
 * a marca de água antes da aprovação (RN-045).
 */
@Injectable()
export class SubmitDeliveryUseCase {
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

  async execute(input: SubmitDeliveryInput): Promise<{ deal: Deal; delivery: Delivery }> {
    const now = this.clock.now();

    if (!input.note.trim()) {
      throw new BusinessRuleError('A delivery needs a note or at least one file');
    }

    return this.transactions.run(async (tx) => {
      const found = await this.deals.findById(input.dealId, tx);
      const deal = requireCreator(
        requireParticipant(found, input.actorUserId, input.dealId),
        input.actorUserId,
      );

      deal.markDelivered(now);

      const latest = await this.deliveries.findLatest(deal.id, tx);

      const delivery = await this.deliveries.create(
        {
          id: this.ids.next(),
          dealId: deal.id,
          version: (latest?.version ?? 0) + 1,
          note: input.note.trim(),
          submittedAt: now,
        },
        tx,
      );

      await this.deals.save(deal, tx);

      await this.messages.create(
        {
          id: this.ids.next(),
          dealId: deal.id,
          senderUserId: null,
          kind: 'STATE_CHANGE',
          body: STATE_CHANGE_BODY.DELIVERED,
          clientId: null,
          createdAt: now,
        },
        tx,
      );

      await this.outbox.enqueue(
        {
          type: 'delivery.submitted',
          payload: { dealId: deal.id, deliveryId: delivery.id, version: delivery.version },
          availableAt: now,
        },
        tx,
      );

      await this.auditLog.record(
        {
          actorUserId: input.actorUserId,
          actorKind: 'USER',
          action: 'delivery.submitted',
          subjectType: 'Deal',
          subjectId: deal.id,
          metadata: { version: delivery.version },
        },
        tx,
      );

      return { deal, delivery };
    });
  }
}
