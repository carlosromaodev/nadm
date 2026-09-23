import { Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { ForbiddenActionError, ResourceNotFoundError } from '@/core/errors/domain-error';
import { WalletsRepository } from '@/modules/ledger/application/ports/ledger.repository';
import { ProfilesRepository } from '@/modules/profiles/application/ports/profiles.repository';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { OutboxRepository } from '@/shared/application/ports/outbox.repository';
import { TransactionRunner, type TxContext } from '@/shared/application/transaction';
import type { Payout } from '../../domain/payout';
import { PayoutsRepository } from '../ports/payouts.repository';
import { PayoutLedgerService } from './payout-ledger';

/**
 * Um levantamento que não é do criador que pergunta não existe para ele.
 *
 * O mesmo princípio dos `Deal`: 404 e não 403, porque confirmar a existência já
 * seria dizer alguma coisa sobre o dinheiro de outra pessoa (RN-063).
 */
function requireOwnPayout(payout: Payout | null, profileId: string, id: string): Payout {
  if (!payout || !payout.isOwnedBy(profileId)) {
    throw new ResourceNotFoundError('Payout', id);
  }

  return payout;
}

export interface CancelPayoutInput {
  actorUserId: string;
  payoutId: string;
}

/**
 * O criador desiste, antes de a administração decidir.
 *
 * O valor reservado volta a disponível **por estorno** — as entradas que o
 * reservaram ficam onde estão (RN-101).
 */
@Injectable()
export class CancelPayoutUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly payouts: PayoutsRepository,
    private readonly profiles: ProfilesRepository,
    private readonly wallets: WalletsRepository,
    private readonly payoutLedger: PayoutLedgerService,
    private readonly outbox: OutboxRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: CancelPayoutInput): Promise<Payout> {
    const now = this.clock.now();

    return this.transactions.run(async (tx) => {
      const profile = await this.profiles.findByUserId(input.actorUserId, tx);

      if (!profile) {
        throw new ResourceNotFoundError('Payout', input.payoutId);
      }

      await this.payouts.lockCreatorForUpdate(profile.id, tx);

      const payout = requireOwnPayout(
        await this.payouts.findById(input.payoutId, tx),
        profile.id,
        input.payoutId,
      );

      payout.cancel(now);

      await this.payouts.save(payout, tx);
      await this.payoutLedger.reverse(payout, now, tx);
      await this.wallets.recomputeFromLedger(profile.id, now, tx);

      await this.outbox.enqueue(
        {
          type: 'payout.cancelled',
          payload: { payoutId: payout.id, profileId: profile.id },
          availableAt: now,
        },
        tx,
      );

      await this.auditLog.record(
        {
          actorUserId: input.actorUserId,
          actorKind: 'USER',
          action: 'payout.cancelled',
          subjectType: 'Payout',
          subjectId: payout.id,
        },
        tx,
      );

      return payout;
    });
  }
}

export interface ReviewPayoutInput {
  reviewerUserId: string;
  payoutId: string;
}

export interface SettlePayoutInput extends ReviewPayoutInput {
  providerReference: string;
}

export interface FailPayoutInput extends ReviewPayoutInput {
  reason: string;
}

/**
 * As transições que são da administração.
 *
 * Enquanto DP-04 não fechar, a ordem ao parceiro é dada por uma pessoa e
 * confirmada por uma pessoa. Quando fechar, `markProcessing` e `settle` passam
 * a ser accionadas pela notificação do parceiro, e **nenhum destes casos de uso
 * muda** — o que muda é quem os chama.
 */
@Injectable()
export class AdminPayoutUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly payouts: PayoutsRepository,
    private readonly wallets: WalletsRepository,
    private readonly payoutLedger: PayoutLedgerService,
    private readonly outbox: OutboxRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly clock: Clock,
  ) {}

  /** A administração aprova. O dinheiro continua reservado, agora a caminho. */
  async approve(input: ReviewPayoutInput): Promise<Payout> {
    return this.change(input.payoutId, async (payout, now, tx) => {
      payout.approve(input.reviewerUserId, now);

      await this.payouts.save(payout, tx);
      await this.record('payout.approved', payout, input.reviewerUserId, now, tx);

      return payout;
    });
  }

  /** A ordem seguiu para o parceiro. Daqui o criador já não cancela. */
  async markProcessing(input: SettlePayoutInput): Promise<Payout> {
    return this.change(input.payoutId, async (payout, now, tx) => {
      payout.markProcessing(input.providerReference);

      await this.payouts.save(payout, tx);
      await this.record('payout.processing', payout, input.reviewerUserId, now, tx);

      return payout;
    });
  }

  /** Confirmado: o dinheiro chegou ao criador e sai do razão da plataforma. */
  async settle(input: ReviewPayoutInput): Promise<Payout> {
    return this.change(input.payoutId, async (payout, now, tx) => {
      payout.markPaid(now);

      await this.payouts.save(payout, tx);
      await this.payoutLedger.settle(payout, now, tx);
      await this.wallets.recomputeFromLedger(payout.profileId, now, tx);
      await this.record('payout.paid', payout, input.reviewerUserId, now, tx);

      return payout;
    });
  }

  /**
   * Falhou no parceiro. O valor volta a disponível por estorno, e o criador
   * pode pedir outra vez.
   */
  async fail(input: FailPayoutInput): Promise<Payout> {
    return this.change(input.payoutId, async (payout, now, tx) => {
      payout.markFailed(input.reason, now);

      await this.payouts.save(payout, tx);
      await this.payoutLedger.reverse(payout, now, tx);
      await this.wallets.recomputeFromLedger(payout.profileId, now, tx);
      await this.record('payout.failed', payout, input.reviewerUserId, now, tx);

      return payout;
    });
  }

  private async change(
    payoutId: string,
    work: (payout: Payout, now: Date, tx: TxContext) => Promise<Payout>,
  ): Promise<Payout> {
    const now = this.clock.now();

    return this.transactions.run(async (tx) => {
      const payout = await this.payouts.findById(payoutId, tx);

      if (!payout) {
        throw new ResourceNotFoundError('Payout', payoutId);
      }

      // O mesmo bloqueio do pedido: uma decisão da administração e um pedido
      // novo do criador não podem ler o razão ao mesmo tempo.
      await this.payouts.lockCreatorForUpdate(payout.profileId, tx);

      return work(payout, now, tx);
    });
  }

  private async record(
    action: string,
    payout: Payout,
    reviewerUserId: string,
    now: Date,
    tx: TxContext,
  ): Promise<void> {
    await this.outbox.enqueue(
      {
        type: action,
        payload: {
          payoutId: payout.id,
          profileId: payout.profileId,
          amountMinor: payout.amount.amountMinor.toString(),
        },
        availableAt: now,
      },
      tx,
    );

    await this.auditLog.record(
      {
        actorUserId: reviewerUserId,
        actorKind: 'USER',
        action,
        subjectType: 'Payout',
        subjectId: payout.id,
        metadata: { amountMinor: payout.amount.amountMinor.toString() },
      },
      tx,
    );
  }
}

/** Erro reservado para quem não é administração e chega a uma rota que o é. */
export class NotAnAdminError extends ForbiddenActionError {
  constructor() {
    super('This operation belongs to the platform administration');
  }
}
