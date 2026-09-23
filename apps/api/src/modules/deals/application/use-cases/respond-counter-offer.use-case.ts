import { Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { BusinessRuleError } from '@/core/errors/domain-error';
import {
  LedgerRepository,
  WalletsRepository,
} from '@/modules/ledger/application/ports/ledger.repository';
import { LedgerTransaction } from '@/modules/ledger/domain/ledger-transaction';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { OutboxRepository } from '@/shared/application/ports/outbox.repository';
import { PricingPolicy } from '@/shared/application/ports/pricing-policy';
import { TransactionRunner, type TxContext } from '@/shared/application/transaction';
import type { Money } from '@/shared/domain/money';
import type { CounterOffer } from '../../domain/counter-offer';
import type { Deal } from '../../domain/deal';
import { NoPendingCounterOfferError } from '../../domain/errors';
import { STATE_CHANGE_BODY } from '../../domain/message';
import { MessagesRepository } from '../ports/conversation.repository';
import { CounterOffersRepository } from '../ports/counter-offers.repository';
import { DealsRepository } from '../ports/deals.repository';
import { EscrowRefundService } from './escrow-refund';
import { SlotReleaseService } from './slot-release';
import { requireBuyer, requireParticipant } from './deal-access';

export interface RespondCounterOfferInput {
  actorUserId: string;
  dealId: string;
}

/**
 * O que a aceitação produziu.
 *
 * `settled` é o caso fechado: o acordo mudou e o escrow já vale o valor novo.
 * `top_up_required` é o caso em que o preço subiu — a transição fica à espera
 * do dinheiro, que é a ordem de DP-15.
 */
export type CounterOfferOutcome = 'settled' | 'top_up_required';

export interface AcceptCounterOfferResult {
  deal: Deal;
  counterOffer: CounterOffer;
  outcome: CounterOfferOutcome;
  /** Quanto falta o comprador reforçar. Só em `top_up_required`. */
  topUp: Money | null;
}

/** Chave semântica do estorno parcial de uma contraproposta mais barata. */
export function counterOfferRefundReference(counterOfferId: string): string {
  return `ledger:counter-refund:${counterOfferId}`;
}

/**
 * T5 e T6 — o comprador responde à contraproposta.
 *
 * Aceitar tem três caras, e a diferença entre elas é só onde está o dinheiro:
 *
 *   **preço igual** — só o prazo mudou. Troca-se o snapshot e acabou.
 *   **preço mais baixo** — estorno parcial da diferença, na mesma transacção.
 *   **preço mais alto** — o comprador tem de reforçar. Este caso de uso não
 *   transita nada: devolve o que falta pagar, e quem faz T5 acontecer é a
 *   captura do reforço, em `HandlePaymentCapturedUseCase`. É a mesma ordem de
 *   sempre — o dinheiro primeiro, o estado depois (DP-15).
 */
@Injectable()
export class RespondCounterOfferUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly deals: DealsRepository,
    private readonly counterOffers: CounterOffersRepository,
    private readonly messages: MessagesRepository,
    private readonly ledger: LedgerRepository,
    private readonly wallets: WalletsRepository,
    private readonly escrow: EscrowRefundService,
    private readonly slots: SlotReleaseService,
    private readonly outbox: OutboxRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly ids: IdGenerator,
    private readonly pricing: PricingPolicy,
    private readonly clock: Clock,
  ) {}

  /** T5 — o comprador aceita os termos novos. */
  async accept(input: RespondCounterOfferInput): Promise<AcceptCounterOfferResult> {
    const now = this.clock.now();

    return this.transactions.run(async (tx) => {
      const { deal, counterOffer } = await this.load(input, tx);

      const settlement = deal.settlementFor(
        counterOffer.price,
        this.pricing.platformFeeBasisPoints(),
      );

      // O preço subiu: a transição fica à espera do dinheiro. Nada muda aqui,
      // nem no `Deal` nem no razão — quem fecha isto é a captura do reforço.
      if (settlement.isPositive) {
        return { deal, counterOffer, outcome: 'top_up_required', topUp: settlement };
      }

      await applyAcceptedCounterOffer(
        {
          deal,
          counterOffer,
          actorUserId: input.actorUserId,
          deals: this.deals,
          counterOffers: this.counterOffers,
          messages: this.messages,
          ledger: this.ledger,
          wallets: this.wallets,
          outbox: this.outbox,
          auditLog: this.auditLog,
          ids: this.ids,
          pricing: this.pricing,
        },
        now,
        tx,
      );

      return { deal, counterOffer, outcome: 'settled', topUp: null };
    });
  }

  /** T6 — o comprador recusa os termos novos e o negócio fecha, com estorno. */
  async decline(input: RespondCounterOfferInput): Promise<Deal> {
    const now = this.clock.now();

    return this.transactions.run(async (tx) => {
      const { deal, counterOffer } = await this.load(input, tx);

      deal.declineCounterOffer(now);

      await this.counterOffers.resolve(counterOffer.id, 'DECLINED', now, tx);

      await this.messages.create(
        {
          id: this.ids.next(),
          dealId: deal.id,
          senderUserId: null,
          kind: 'STATE_CHANGE',
          body: STATE_CHANGE_BODY.COUNTER_OFFER_DECLINED,
          clientId: null,
          createdAt: now,
        },
        tx,
      );

      // O comprador recusou termos que não pediu: o dinheiro que pôs para o
      // acordo original volta inteiro.
      const closure = await this.escrow.closeEscrow(
        {
          deal,
          cause: 'deal.counter_offer_declined',
          actorUserId: input.actorUserId,
          actorKind: 'USER',
        },
        now,
        tx,
      );

      // O negócio nunca chegou a arrancar: a vaga volta ao mercado.
      await this.slots.releaseFor(deal, tx);

      await this.deals.save(deal, tx);

      await this.outbox.enqueue(
        {
          type: 'deal.counter_offer_declined',
          payload: {
            dealId: deal.id,
            counterOfferId: counterOffer.id,
            creatorProfileId: deal.creatorProfileId,
            refunded: closure === 'refunded',
          },
          availableAt: now,
        },
        tx,
      );

      await this.auditLog.record(
        {
          actorUserId: input.actorUserId,
          actorKind: 'USER',
          action: 'deal.counter_offer_declined',
          subjectType: 'Deal',
          subjectId: deal.id,
          metadata: { counterOfferId: counterOffer.id, escrow: closure },
        },
        tx,
      );

      return deal;
    });
  }

  private async load(
    input: RespondCounterOfferInput,
    tx: TxContext,
  ): Promise<{ deal: Deal; counterOffer: CounterOffer }> {
    const found = await this.deals.findById(input.dealId, tx);
    const deal = requireBuyer(
      requireParticipant(found, input.actorUserId, input.dealId),
      input.actorUserId,
    );

    const counterOffer = await this.counterOffers.findPending(deal.id, tx);

    if (!counterOffer) {
      throw new NoPendingCounterOfferError();
    }

    return { deal, counterOffer };
  }
}

interface ApplyDependencies {
  deal: Deal;
  counterOffer: CounterOffer;
  actorUserId: string | null;
  deals: DealsRepository;
  counterOffers: CounterOffersRepository;
  messages: MessagesRepository;
  ledger: LedgerRepository;
  wallets: WalletsRepository;
  outbox: OutboxRepository;
  auditLog: AuditLogRepository;
  ids: IdGenerator;
  pricing: PricingPolicy;
}

/**
 * T5 propriamente dita: troca o snapshot, reparte o valor novo e acerta o
 * escrow.
 *
 * Vive fora da classe porque tem **dois** pontos de entrada: a aceitação
 * directa, quando o preço não sobe, e a captura do reforço, quando sobe. Uma
 * segunda cópia disto seria uma segunda maneira de o escrow deixar de valer o
 * que o `Deal` diz que vale.
 */
export async function applyAcceptedCounterOffer(
  deps: ApplyDependencies,
  now: Date,
  tx: TxContext,
): Promise<void> {
  const { deal, counterOffer } = deps;

  const settlement = deal.settlementFor(
    counterOffer.price,
    deps.pricing.platformFeeBasisPoints(),
  );

  deal.acceptCounterOffer(
    {
      price: counterOffer.price,
      slaHours: counterOffer.slaHours,
      platformFeeBasisPoints: deps.pricing.platformFeeBasisPoints(),
    },
    now,
    deps.pricing.proposalWindowHours(),
  );

  // O preço desceu: a diferença deixa de ser obrigação da plataforma perante o
  // `Deal` e passa a ser dívida ao comprador. Um lançamento novo, nunca uma
  // reescrita do da captura (RN-101).
  if (settlement.isNegative) {
    const diferenca = settlement.abs();

    await deps.ledger.record(
      LedgerTransaction.create({
        id: deps.ids.next(),
        kind: 'COUNTER_OFFER_REFUND',
        externalReference: counterOfferRefundReference(counterOffer.id),
        dealId: deal.id,
        description: `Acerto da contraproposta do pedido ${deal.reference}`,
        occurredAt: now,
        entries: [
          {
            account: 'ESCROW',
            subjectType: 'DEAL',
            subjectId: deal.id,
            direction: 'DEBIT',
            amount: diferenca,
          },
          {
            account: 'REFUNDS_PAYABLE',
            subjectType: 'DEAL',
            subjectId: deal.id,
            direction: 'CREDIT',
            amount: diferenca,
          },
        ],
      }),
      tx,
    );
  }

  await deps.counterOffers.resolve(counterOffer.id, 'ACCEPTED', now, tx);

  // A escrita que altera valores está à parte de propósito: ver a porta.
  await deps.deals.saveRenegotiated(deal, tx);

  await deps.messages.create(
    {
      id: deps.ids.next(),
      dealId: deal.id,
      senderUserId: null,
      kind: 'STATE_CHANGE',
      body: STATE_CHANGE_BODY.COUNTER_OFFER_ACCEPTED,
      clientId: null,
      createdAt: now,
    },
    tx,
  );

  await deps.outbox.enqueue(
    {
      type: 'deal.counter_offer_accepted',
      payload: {
        dealId: deal.id,
        counterOfferId: counterOffer.id,
        creatorProfileId: deal.creatorProfileId,
        amountMinor: deal.amount.amountMinor.toString(),
        settlementMinor: settlement.amountMinor.toString(),
      },
      availableAt: now,
    },
    tx,
  );

  await deps.auditLog.record(
    {
      actorUserId: deps.actorUserId,
      actorKind: deps.actorUserId === null ? 'SYSTEM' : 'USER',
      action: 'deal.counter_offer_accepted',
      subjectType: 'Deal',
      subjectId: deal.id,
      metadata: {
        counterOfferId: counterOffer.id,
        amountMinor: deal.amount.amountMinor.toString(),
        settlementMinor: settlement.amountMinor.toString(),
      },
    },
    tx,
  );
}

/** Um acerto que não fecha a zero é um erro de cálculo, não um caso de negócio. */
export class SettlementMismatchError extends BusinessRuleError {
  constructor(expected: Money, received: Money) {
    super(`Expected a top-up of ${expected.toString()}, received ${received.toString()}`);
  }
}
