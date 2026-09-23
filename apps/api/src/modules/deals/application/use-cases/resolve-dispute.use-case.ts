import { Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { ResourceNotFoundError } from '@/core/errors/domain-error';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { OutboxRepository } from '@/shared/application/ports/outbox.repository';
import { TransactionRunner } from '@/shared/application/transaction';
import type { Deal } from '../../domain/deal';
import type { Dispute, DisputeResolution } from '../../domain/dispute';
import { STATE_CHANGE_BODY } from '../../domain/message';
import { MessagesRepository } from '../ports/conversation.repository';
import { DealsRepository } from '../ports/deals.repository';
import { DisputesRepository } from '../ports/disputes.repository';
import { EscrowRefundService } from './escrow-refund';

export interface ResolveDisputeInput {
  reviewerUserId: string;
  disputeId: string;
  resolution: DisputeResolution;
  note?: string | null;
}

/**
 * T15 — a administração decide a disputa.
 *
 * **A favor do comprador**, o `Deal` vai a `REFUNDED` e o escrow é estornado, na
 * mesma transacção. **A favor do criador**, nada se move: o que acontece é a
 * disputa deixar de bloquear, e a aprovação voltar a poder libertar o dinheiro
 * pelo caminho normal.
 *
 * É a única transição do `Deal` accionada por quem não é parte dele, e é por
 * isso que fica inteira na auditoria — quem decidiu, a favor de quem e porquê.
 */
@Injectable()
export class ResolveDisputeUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly deals: DealsRepository,
    private readonly disputes: DisputesRepository,
    private readonly messages: MessagesRepository,
    private readonly escrow: EscrowRefundService,
    private readonly outbox: OutboxRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: ResolveDisputeInput): Promise<{ deal: Deal; dispute: Dispute }> {
    const now = this.clock.now();

    return this.transactions.run(async (tx) => {
      const dispute = await this.disputes.findById(input.disputeId, tx);

      if (!dispute) {
        throw new ResourceNotFoundError('Dispute', input.disputeId);
      }

      const deal = await this.deals.findById(dispute.dealId, tx);

      if (!deal) {
        throw new ResourceNotFoundError('Deal', dispute.dealId);
      }

      dispute.resolve({
        resolution: input.resolution,
        decidedByUserId: input.reviewerUserId,
        note: input.note ?? null,
        now,
      });

      await this.disputes.save(dispute, tx);

      await this.messages.create(
        {
          id: this.ids.next(),
          dealId: deal.id,
          senderUserId: null,
          kind: 'STATE_CHANGE',
          body:
            input.resolution === 'BUYER'
              ? STATE_CHANGE_BODY.DISPUTE_RESOLVED_BUYER
              : STATE_CHANGE_BODY.DISPUTE_RESOLVED_CREATOR,
          clientId: null,
          createdAt: now,
        },
        tx,
      );

      // A decisão da administração entra na conversa como `SYSTEM`, visível às
      // duas partes: quem foi decidido contra tem direito a ler o porquê.
      if (input.note?.trim()) {
        await this.messages.create(
          {
            id: this.ids.next(),
            dealId: deal.id,
            senderUserId: null,
            kind: 'SYSTEM',
            body: input.note.trim(),
            clientId: null,
            createdAt: now,
          },
          tx,
        );
      }

      if (input.resolution === 'BUYER') {
        deal.refund(now);

        await this.escrow.closeEscrow(
          {
            deal,
            cause: 'dispute.resolved_for_buyer',
            actorUserId: input.reviewerUserId,
            actorKind: 'USER',
          },
          now,
          tx,
        );

        await this.deals.save(deal, tx);
      }

      await this.outbox.enqueue(
        {
          type: 'dispute.resolved',
          payload: {
            dealId: deal.id,
            disputeId: dispute.id,
            resolution: input.resolution,
          },
          availableAt: now,
        },
        tx,
      );

      await this.auditLog.record(
        {
          actorUserId: input.reviewerUserId,
          actorKind: 'USER',
          action: 'dispute.resolved',
          subjectType: 'Deal',
          subjectId: deal.id,
          metadata: {
            disputeId: dispute.id,
            resolution: input.resolution,
            refunded: input.resolution === 'BUYER',
          },
        },
        tx,
      );

      return { deal, dispute };
    });
  }
}

/** A fila da administração, por ordem de chegada. */
@Injectable()
export class ListOpenDisputesUseCase {
  constructor(private readonly disputes: DisputesRepository) {}

  execute(input: { limit?: number } = {}): Promise<Dispute[]> {
    return this.disputes.listOpen(input.limit ?? 50);
  }
}
