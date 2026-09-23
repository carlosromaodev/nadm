import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { CounterOffersRepository } from '@/modules/deals/application/ports/counter-offers.repository';
import { DealsRepository } from '@/modules/deals/application/ports/deals.repository';
import { MessagesRepository } from '@/modules/deals/application/ports/conversation.repository';
import { applyAcceptedCounterOffer } from '@/modules/deals/application/use-cases/respond-counter-offer.use-case';
import { STATE_CHANGE_BODY } from '@/modules/deals/domain/message';
import { FulfilContentUnlockUseCase } from '@/modules/deals/application/use-cases/fulfil-content-unlock.use-case';
import { LedgerRepository } from '@/modules/ledger/application/ports/ledger.repository';
import { WalletsRepository } from '@/modules/ledger/application/ports/ledger.repository';
import {
  LedgerTransaction,
  PLATFORM_SUBJECT_ID,
} from '@/modules/ledger/domain/ledger-transaction';
import { PricingPolicy } from '@/shared/application/ports/pricing-policy';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { OutboxRepository } from '@/shared/application/ports/outbox.repository';
import { TransactionRunner, type TxContext } from '@/shared/application/transaction';
import { Money } from '@/shared/domain/money';
import type { Deal } from '@/modules/deals/domain/deal';
import type { ProviderEvent } from '../ports/payments.gateway';
import {
  PaymentEventsRepository,
  PaymentIntentsRepository,
} from '../ports/payments.repository';

/** Chave semântica da entrada do dinheiro. Um `Deal` é capturado uma vez só. */
export function captureReference(dealId: string): string {
  return `ledger:capture:${dealId}`;
}

/**
 * Chave semântica do reforço. É por contraproposta e não por `Deal`: um pedido
 * pode ser renegociado mais do que uma vez, e cada reforço é dinheiro novo.
 */
export function topUpReference(counterOfferId: string): string {
  return `ledger:top-up:${counterOfferId}`;
}

export type PaymentEventOutcome =
  | 'captured'
  | 'duplicate'
  | 'unknown_reference'
  | 'amount_mismatch'
  | 'inactive_intent'
  | 'settlement_mismatch'
  | 'ignored';

/**
 * E1 + T7 — a notificação do parceiro move o dinheiro para retido e arranca o
 * trabalho. Nunca é accionada por um utilizador.
 *
 * Segunda camada de idempotência (RN-091): a mesma notificação entregue duas
 * vezes produz efeito uma só vez, garantido pelo `providerEventId` único.
 */
@Injectable()
export class HandlePaymentCapturedUseCase {
  private readonly logger = new Logger(HandlePaymentCapturedUseCase.name);

  constructor(
    private readonly transactions: TransactionRunner,
    private readonly deals: DealsRepository,
    private readonly intents: PaymentIntentsRepository,
    private readonly events: PaymentEventsRepository,
    private readonly messages: MessagesRepository,
    private readonly ledger: LedgerRepository,
    private readonly wallets: WalletsRepository,
    private readonly counterOffers: CounterOffersRepository,
    private readonly contentUnlock: FulfilContentUnlockUseCase,
    private readonly outbox: OutboxRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly ids: IdGenerator,
    private readonly pricing: PricingPolicy,
    private readonly clock: Clock,
  ) {}

  async execute(event: ProviderEvent): Promise<PaymentEventOutcome> {
    const now = this.clock.now();

    return this.transactions.run(async (tx) => {
      const intent = await this.intents.findByProviderReference(event.providerReference, tx);

      if (!intent) {
        this.logger.warn(`Notificação para referência desconhecida: ${event.providerReference}`);
        return 'unknown_reference';
      }

      const recorded = await this.events.recordIfNew(
        {
          id: this.ids.next(),
          paymentIntentId: intent.id,
          providerEventId: event.providerEventId,
          type: event.type,
          payload: event.raw,
          receivedAt: now,
        },
        tx,
      );

      if (!recorded) {
        return 'duplicate';
      }

      if (event.type !== 'payment.captured') {
        await this.events.markProcessed(recorded.id, now, tx);
        return 'ignored';
      }

      // Uma captura sobre uma intenção que já falhou ou expirou não retém
      // dinheiro nenhum: fica para reconciliação, como qualquer divergência.
      if (intent.status !== 'CREATED' && intent.status !== 'PENDING') {
        this.logger.warn(
          `Captura para a intenção ${intent.id}, que está em ${intent.status}`,
        );

        await this.outbox.enqueue(
          {
            type: 'payment.inactive_intent',
            payload: {
              dealId: intent.dealId,
              providerReference: event.providerReference,
              intentStatus: intent.status,
            },
            availableAt: now,
          },
          tx,
        );

        await this.events.markProcessed(recorded.id, now, tx);

        return 'inactive_intent';
      }

      const expected = Money.fromMinor(intent.amountMinor, intent.currency as 'AOA');

      // RN-094: valor diferente do esperado não move escrow nenhum. Fica para
      // reconciliação, decidida por uma pessoa.
      if (!event.capturedAmount || !event.capturedAmount.equals(expected)) {
        await this.outbox.enqueue(
          {
            type: 'payment.amount_mismatch',
            payload: {
              dealId: intent.dealId,
              providerReference: event.providerReference,
              expectedMinor: expected.amountMinor.toString(),
              capturedMinor: event.capturedAmount?.amountMinor.toString() ?? null,
            },
            availableAt: now,
          },
          tx,
        );

        await this.auditLog.record(
          {
            actorUserId: null,
            actorKind: 'PROVIDER',
            action: 'payment.amount_mismatch',
            subjectType: 'Deal',
            subjectId: intent.dealId,
            metadata: { providerReference: event.providerReference },
          },
          tx,
        );

        await this.events.markProcessed(recorded.id, now, tx);

        return 'amount_mismatch';
      }

      const deal = await this.deals.findById(intent.dealId, tx);

      if (!deal) {
        this.logger.error(`Intenção ${intent.id} aponta para um Deal inexistente`);
        return 'unknown_reference';
      }

      // O reforço de uma contraproposta aceite segue outro caminho: o escrow
      // já está retido, e o que a captura faz é fazer T5 acontecer.
      if (intent.purpose === 'TOP_UP') {
        return this.applyTopUp(intent, deal, expected, recorded.id, now, tx);
      }

      await this.intents.markCaptured(intent.id, now, tx);

      // E1 — o dinheiro entra no razão. A conta `ESCROW` representa a obrigação
      // da plataforma perante este `Deal`, e `PROVIDER_CLEARING` o que há a
      // receber do parceiro (SDD §11.1). Sem esta entrada, o escrow seria
      // debitado na libertação sem nunca ter sido creditado.
      await this.ledger.record(
        LedgerTransaction.create({
          id: this.ids.next(),
          kind: 'ESCROW_FUNDING',
          externalReference: captureReference(deal.id),
          dealId: deal.id,
          description: `Captura do pagamento do pedido ${deal.reference}`,
          occurredAt: now,
          entries: [
            {
              account: 'PROVIDER_CLEARING',
              subjectType: 'PLATFORM',
              subjectId: PLATFORM_SUBJECT_ID,
              direction: 'DEBIT',
              amount: expected,
            },
            {
              account: 'ESCROW',
              subjectType: 'DEAL',
              subjectId: deal.id,
              direction: 'CREDIT',
              amount: expected,
            },
          ],
        }),
        tx,
      );

      deal.markPaymentCaptured(now);

      await this.deals.save(deal, tx);

      await this.messages.create(
        {
          id: this.ids.next(),
          dealId: deal.id,
          senderUserId: null,
          kind: 'STATE_CHANGE',
          body: STATE_CHANGE_BODY.PAYMENT_HELD,
          clientId: null,
          createdAt: now,
        },
        tx,
      );

      // UC-09 — numa compra de conteúdo não há nada para o criador aceitar nem
      // para entregar: o ficheiro já existe. O resto do caminho acontece aqui,
      // na mesma transacção que reteve o dinheiro.
      if (this.contentUnlock.applies(deal)) {
        await this.contentUnlock.execute(deal, now, tx);
      }

      await this.outbox.enqueue(
        {
          type: 'payment.captured',
          payload: { dealId: deal.id, amountMinor: expected.amountMinor.toString() },
          availableAt: now,
        },
        tx,
      );

      await this.auditLog.record(
        {
          actorUserId: null,
          actorKind: 'PROVIDER',
          action: 'payment.captured',
          subjectType: 'Deal',
          subjectId: deal.id,
          metadata: {
            providerReference: event.providerReference,
            amountMinor: expected.amountMinor.toString(),
          },
        },
        tx,
      );

      await this.events.markProcessed(recorded.id, now, tx);

      return 'captured';
    });
  }

  /**
   * T5 pelo caminho do dinheiro — o comprador reforçou a diferença de uma
   * contraproposta mais cara, e é a captura desse reforço que muda o acordo.
   *
   * O escrow cresce pelo valor do reforço e passa a valer exactamente o preço
   * novo. Nada disto é accionado por um utilizador: a aceitação foi dele, a
   * transição é consequência da notificação do parceiro.
   */
  private async applyTopUp(
    intent: { id: string; counterOfferId: string | null },
    deal: Deal,
    captured: Money,
    eventId: string,
    now: Date,
    tx: TxContext,
  ): Promise<PaymentEventOutcome> {
    const counterOffer = intent.counterOfferId
      ? await this.counterOffers.findById(intent.counterOfferId, tx)
      : null;

    // Um reforço sem contraproposta viva já não tem acordo para fechar — o
    // comprador recusou entretanto, ou o prazo caiu. Fica para reconciliação,
    // decidida por uma pessoa, como qualquer divergência de dinheiro.
    if (!counterOffer || counterOffer.status !== 'PENDING') {
      return this.flagForReconciliation(
        deal,
        eventId,
        now,
        tx,
        'counter_offer_not_pending',
        { counterOfferId: intent.counterOfferId },
      );
    }

    const esperado = deal.settlementFor(
      counterOffer.price,
      this.pricing.platformFeeBasisPoints(),
    );

    // RN-094 aplicado ao reforço: se o que entrou não é exactamente o que
    // faltava, o escrow deixaria de valer o que o `Deal` diz que vale.
    if (!captured.equals(esperado)) {
      return this.flagForReconciliation(deal, eventId, now, tx, 'settlement_mismatch', {
        expectedMinor: esperado.amountMinor.toString(),
        capturedMinor: captured.amountMinor.toString(),
      });
    }

    await this.intents.markCaptured(intent.id, now, tx);

    await this.ledger.record(
      LedgerTransaction.create({
        id: this.ids.next(),
        kind: 'ESCROW_TOP_UP',
        externalReference: topUpReference(counterOffer.id),
        dealId: deal.id,
        description: `Reforço da contraproposta do pedido ${deal.reference}`,
        occurredAt: now,
        entries: [
          {
            account: 'PROVIDER_CLEARING',
            subjectType: 'PLATFORM',
            subjectId: PLATFORM_SUBJECT_ID,
            direction: 'DEBIT',
            amount: captured,
          },
          {
            account: 'ESCROW',
            subjectType: 'DEAL',
            subjectId: deal.id,
            direction: 'CREDIT',
            amount: captured,
          },
        ],
      }),
      tx,
    );

    await applyAcceptedCounterOffer(
      {
        deal,
        counterOffer,
        // Quem aceitou foi o comprador; quem accionou a transição foi a
        // notificação do parceiro. A auditoria regista o segundo.
        actorUserId: null,
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

    await this.events.markProcessed(eventId, now, tx);

    return 'captured';
  }

  /** Dinheiro que entrou sem sítio para ir. Não se mexe em nada; alerta-se. */
  private async flagForReconciliation(
    deal: Deal,
    eventId: string,
    now: Date,
    tx: TxContext,
    reason: string,
    metadata: Record<string, unknown>,
  ): Promise<PaymentEventOutcome> {
    this.logger.warn(`Reforço sem destino no pedido ${deal.id}: ${reason}`);

    await this.outbox.enqueue(
      {
        type: 'payment.settlement_mismatch',
        payload: { dealId: deal.id, reason, ...metadata },
        availableAt: now,
      },
      tx,
    );

    await this.auditLog.record(
      {
        actorUserId: null,
        actorKind: 'PROVIDER',
        action: 'payment.settlement_mismatch',
        subjectType: 'Deal',
        subjectId: deal.id,
        metadata: { reason, ...metadata },
      },
      tx,
    );

    await this.events.markProcessed(eventId, now, tx);

    return 'settlement_mismatch';
  }
}
