import { Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { OutboxRepository } from '@/shared/application/ports/outbox.repository';
import { TransactionRunner } from '@/shared/application/transaction';
import type { Deal } from '../../domain/deal';
import {
  DISPUTABLE_DEAL_STATUSES,
  Dispute,
  DisputeAlreadyOpenError,
  NoOpenDisputeError,
} from '../../domain/dispute';
import { InvalidDealTransitionError } from '../../domain/errors';
import { STATE_CHANGE_BODY } from '../../domain/message';
import { MessagesRepository } from '../ports/conversation.repository';
import { DealsRepository } from '../ports/deals.repository';
import { DisputesRepository } from '../ports/disputes.repository';
import { requireParticipant } from './deal-access';

export interface OpenDisputeInput {
  actorUserId: string;
  dealId: string;
  reason: string;
}

/**
 * Qualquer uma das partes abre a disputa.
 *
 * **É das poucas acções do sistema que não tem dono exclusivo** — o comprador
 * que não recebeu o que pediu e o criador que não consegue entregar têm o mesmo
 * direito de pedir que alguém decida.
 *
 * Abrir não move dinheiro. O que faz é **travar** a libertação (RN-048): a
 * partir daqui, aprovar a entrega deixa de libertar o escrow até haver decisão.
 */
@Injectable()
export class OpenDisputeUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly deals: DealsRepository,
    private readonly disputes: DisputesRepository,
    private readonly messages: MessagesRepository,
    private readonly outbox: OutboxRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: OpenDisputeInput): Promise<{ deal: Deal; dispute: Dispute }> {
    const now = this.clock.now();

    return this.transactions.run(async (tx) => {
      const deal = requireParticipant(
        await this.deals.findById(input.dealId, tx),
        input.actorUserId,
        input.dealId,
      );

      if (!DISPUTABLE_DEAL_STATUSES.includes(deal.status as never)) {
        throw new InvalidDealTransitionError(deal.status, 'REFUNDED');
      }

      if (await this.disputes.findOpenByDeal(deal.id, tx)) {
        throw new DisputeAlreadyOpenError();
      }

      const dispute = Dispute.open({
        id: this.ids.next(),
        dealId: deal.id,
        openedByUserId: input.actorUserId,
        reason: input.reason,
        now,
      });

      await this.disputes.create(dispute, tx);

      // O motivo fica na conversa, onde as duas partes o lêem, e não só numa
      // coluna que ninguém abre.
      await this.messages.create(
        {
          id: this.ids.next(),
          dealId: deal.id,
          senderUserId: input.actorUserId,
          kind: 'TEXT',
          body: input.reason.trim(),
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
          body: STATE_CHANGE_BODY.DISPUTE_OPENED,
          clientId: null,
          createdAt: now,
        },
        tx,
      );

      await this.outbox.enqueue(
        {
          type: 'dispute.opened',
          payload: {
            dealId: deal.id,
            disputeId: dispute.id,
            openedByUserId: input.actorUserId,
          },
          availableAt: now,
        },
        tx,
      );

      await this.auditLog.record(
        {
          actorUserId: input.actorUserId,
          actorKind: 'USER',
          action: 'dispute.opened',
          subjectType: 'Deal',
          subjectId: deal.id,
          metadata: { disputeId: dispute.id },
        },
        tx,
      );

      return { deal, dispute };
    });
  }
}

export interface WithdrawDisputeInput {
  actorUserId: string;
  dealId: string;
}

/**
 * As partes entenderam-se antes de a administração decidir.
 *
 * Só quem abriu é que retira: deixar a outra parte fechar a disputa alheia
 * daria a quem está em falta a maneira mais simples de se safar.
 */
@Injectable()
export class WithdrawDisputeUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly deals: DealsRepository,
    private readonly disputes: DisputesRepository,
    private readonly messages: MessagesRepository,
    private readonly outbox: OutboxRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: WithdrawDisputeInput): Promise<Dispute> {
    const now = this.clock.now();

    return this.transactions.run(async (tx) => {
      const deal = requireParticipant(
        await this.deals.findById(input.dealId, tx),
        input.actorUserId,
        input.dealId,
      );

      const dispute = await this.disputes.findOpenByDeal(deal.id, tx);

      if (!dispute) {
        throw new NoOpenDisputeError();
      }

      if (dispute.openedByUserId !== input.actorUserId) {
        // Para quem não a abriu, não há disputa dele para retirar.
        throw new NoOpenDisputeError();
      }

      dispute.withdraw(now);

      await this.disputes.save(dispute, tx);

      await this.messages.create(
        {
          id: this.ids.next(),
          dealId: deal.id,
          senderUserId: null,
          kind: 'STATE_CHANGE',
          body: STATE_CHANGE_BODY.DISPUTE_WITHDRAWN,
          clientId: null,
          createdAt: now,
        },
        tx,
      );

      await this.outbox.enqueue(
        {
          type: 'dispute.withdrawn',
          payload: { dealId: deal.id, disputeId: dispute.id },
          availableAt: now,
        },
        tx,
      );

      await this.auditLog.record(
        {
          actorUserId: input.actorUserId,
          actorKind: 'USER',
          action: 'dispute.withdrawn',
          subjectType: 'Deal',
          subjectId: deal.id,
          metadata: { disputeId: dispute.id },
        },
        tx,
      );

      return dispute;
    });
  }
}
