import { Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { PaymentIntentsRepository } from '@/modules/payments/application/ports/payments.repository';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { OutboxRepository } from '@/shared/application/ports/outbox.repository';
import { TransactionRunner } from '@/shared/application/transaction';
import type { Deal } from '../../domain/deal';
import { STATE_CHANGE_BODY } from '../../domain/message';
import { MessagesRepository } from '../ports/conversation.repository';
import { DealsRepository } from '../ports/deals.repository';
import { requireCreator, requireParticipant } from './deal-access';
import { EscrowRefundService } from './escrow-refund';
import { SlotReleaseService } from './slot-release';

export interface DeclineDealInput {
  actorUserId: string;
  dealId: string;
  /** Opcional, mas é o que o comprador lê para perceber a recusa. */
  reason?: string | null;
}

/**
 * T3 — o criador recusa o pedido.
 *
 * Com DP-15 o dinheiro já lá está: recusar obriga a estornar, e o estorno corre
 * na mesma transacção que a mudança de estado. Um pedido recusado com o
 * dinheiro ainda em escrow seria a pior falha possível do sistema.
 */
@Injectable()
export class DeclineDealUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly deals: DealsRepository,
    private readonly messages: MessagesRepository,
    private readonly intents: PaymentIntentsRepository,
    private readonly escrow: EscrowRefundService,
    private readonly slots: SlotReleaseService,
    private readonly outbox: OutboxRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: DeclineDealInput): Promise<Deal> {
    const now = this.clock.now();
    const reason = input.reason?.trim() || null;

    return this.transactions.run(async (tx) => {
      const found = await this.deals.findById(input.dealId, tx);
      const deal = requireCreator(
        requireParticipant(found, input.actorUserId, input.dealId),
        input.actorUserId,
      );

      deal.decline(now);

      if (reason) {
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
      }

      await this.messages.create(
        {
          id: this.ids.next(),
          dealId: deal.id,
          senderUserId: null,
          kind: 'STATE_CHANGE',
          body: STATE_CHANGE_BODY.DECLINED,
          clientId: null,
          createdAt: now,
        },
        tx,
      );

      const closure = await this.escrow.closeEscrow(
        { deal, cause: 'deal.declined', actorUserId: input.actorUserId, actorKind: 'USER' },
        now,
        tx,
      );

      // Sem dinheiro retido sobra uma intenção viva, e uma captura atrasada
      // sobre um pedido recusado não teria onde aterrar.
      if (closure === 'never_funded') {
        await this.intents.expireActiveByDeal(deal.id, now, tx);
      }

      // A vaga volta ao mercado: o criador recusou, e o tempo continua livre.
      await this.slots.releaseFor(deal, tx);

      await this.deals.save(deal, tx);

      await this.outbox.enqueue(
        {
          type: 'deal.declined',
          payload: { dealId: deal.id, buyerUserId: deal.buyerUserId, refunded: closure === 'refunded' },
          availableAt: now,
        },
        tx,
      );

      await this.auditLog.record(
        {
          actorUserId: input.actorUserId,
          actorKind: 'USER',
          action: 'deal.declined',
          subjectType: 'Deal',
          subjectId: deal.id,
          metadata: { escrow: closure },
        },
        tx,
      );

      return deal;
    });
  }
}
