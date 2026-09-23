import { Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { ResourceNotFoundError } from '@/core/errors/domain-error';
import { UsersRepository } from '@/modules/identity/application/ports/identity.repository';
import { LedgerRepository } from '@/modules/ledger/application/ports/ledger.repository';
import { WalletsRepository } from '@/modules/ledger/application/ports/ledger.repository';
import { ProfilesRepository } from '@/modules/profiles/application/ports/profiles.repository';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { OutboxRepository } from '@/shared/application/ports/outbox.repository';
import { PricingPolicy } from '@/shared/application/ports/pricing-policy';
import { TransactionRunner } from '@/shared/application/transaction';
import { Money } from '@/shared/domain/money';
import {
  BelowMinimumPayoutError,
  IdentityNotVerifiedError,
  InsufficientBalanceError,
  Payout,
  type PayoutMethod,
} from '../../domain/payout';
import { PayoutsRepository } from '../ports/payouts.repository';
import { PayoutLedgerService } from './payout-ledger';

export interface RequestPayoutInput {
  actorUserId: string;
  amountMinor: string;
  method: PayoutMethod;
  destination: string;
}

/**
 * O criador tira o dinheiro da plataforma.
 *
 * É o ponto em que um erro no razão deixa de ser corrigível com uma linha nova:
 * o dinheiro sai. Por isso três coisas acontecem antes de qualquer outra —
 * bloqueia-se a linha do criador, lê-se o saldo **do razão**, e só então se
 * decide.
 */
@Injectable()
export class RequestPayoutUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly payouts: PayoutsRepository,
    private readonly profiles: ProfilesRepository,
    private readonly users: UsersRepository,
    private readonly ledger: LedgerRepository,
    private readonly wallets: WalletsRepository,
    private readonly payoutLedger: PayoutLedgerService,
    private readonly outbox: OutboxRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly ids: IdGenerator,
    private readonly pricing: PricingPolicy,
    private readonly clock: Clock,
  ) {}

  async execute(input: RequestPayoutInput): Promise<Payout> {
    const now = this.clock.now();

    return this.transactions.run(async (tx) => {
      const profile = await this.profiles.findByUserId(input.actorUserId, tx);

      if (!profile) {
        throw new ResourceNotFoundError('Profile', input.actorUserId);
      }

      const user = await this.users.findById(input.actorUserId, tx);

      // RN-051 — sem identidade verificada não sai dinheiro. É 403 e não 404:
      // o recurso é dele, o que falta é a condição.
      if (user?.verificationLevel !== 'IDENTITY') {
        throw new IdentityNotVerifiedError();
      }

      // RN-053 — daqui para a frente, os pedidos deste criador são um de cada
      // vez. O segundo espera, e quando ler o razão já lá encontra a reserva
      // do primeiro.
      await this.payouts.lockCreatorForUpdate(profile.id, tx);

      const amount = Money.fromMinor(input.amountMinor);
      const minimo = Money.fromMinor(this.pricing.minimumPayoutMinor());

      if (amount.lessThan(minimo)) {
        throw new BelowMinimumPayoutError(minimo);
      }

      // RN-050 — o saldo vem do razão, **nunca** da projecção `Wallet`. A
      // projecção pode estar desactualizada ou corrompida; o razão não.
      const disponivel = await this.ledger.amountOwed('CREATOR_AVAILABLE', profile.id, tx);

      if (amount.greaterThan(disponivel)) {
        throw new InsufficientBalanceError(amount, disponivel);
      }

      const payout = Payout.request({
        id: this.ids.next(),
        profileId: profile.id,
        requestedByUserId: input.actorUserId,
        amount,
        // Sem taxa de levantamento enquanto DP-04 não fechar.
        fee: Money.zero(amount.currency),
        method: input.method,
        destination: input.destination,
        now,
      });

      await this.payouts.create(payout, tx);

      // RN-052 — a reserva é imediata. Entre pedir e a administração decidir,
      // o valor já não está disponível para um segundo pedido.
      await this.payoutLedger.reserve(payout, now, tx);

      await this.wallets.recomputeFromLedger(profile.id, now, tx);

      await this.outbox.enqueue(
        {
          type: 'payout.requested',
          payload: {
            payoutId: payout.id,
            profileId: profile.id,
            amountMinor: amount.amountMinor.toString(),
          },
          availableAt: now,
        },
        tx,
      );

      // Sem o destino: é dado que identifica uma conta bancária, e a auditoria
      // regista o acto, não o número.
      await this.auditLog.record(
        {
          actorUserId: input.actorUserId,
          actorKind: 'USER',
          action: 'payout.requested',
          subjectType: 'Payout',
          subjectId: payout.id,
          metadata: {
            amountMinor: amount.amountMinor.toString(),
            method: input.method,
          },
        },
        tx,
      );

      return payout;
    });
  }
}
