import { Injectable } from '@nestjs/common';
import { ResourceConflictError } from '@/core/errors/domain-error';
import { CounterOffersRepository } from '@/modules/deals/application/ports/counter-offers.repository';
import { DealsRepository } from '@/modules/deals/application/ports/deals.repository';
import {
  requireBuyer,
  requireParticipant,
} from '@/modules/deals/application/use-cases/deal-access';
import { NoPendingCounterOfferError } from '@/modules/deals/domain/errors';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { PricingPolicy } from '@/shared/application/ports/pricing-policy';
import { TransactionRunner } from '@/shared/application/transaction';
import type { PaymentIntent } from '../../domain/payment-intent';
import { PaymentsGateway } from '../ports/payments.gateway';
import { PaymentIntentsRepository } from '../ports/payments.repository';

export interface StartCounterOfferTopUpInput {
  actorUserId: string;
  dealId: string;
  payerPhone: string;
  idempotencyKey: string;
}

/**
 * Cobra a diferença quando o comprador aceita uma contraproposta mais cara.
 *
 * É a mesma mecânica do pagamento inicial, e de propósito: o comprador
 * autoriza no telemóvel, o parceiro notifica, e **é a captura que faz a
 * transição acontecer** — aqui, T5. Enquanto não pagar, o pedido fica em
 * `COUNTER_OFFERED` e o escrow continua a valer o preço antigo.
 */
@Injectable()
export class StartCounterOfferTopUpUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly deals: DealsRepository,
    private readonly counterOffers: CounterOffersRepository,
    private readonly intents: PaymentIntentsRepository,
    private readonly gateway: PaymentsGateway,
    private readonly auditLog: AuditLogRepository,
    private readonly ids: IdGenerator,
    private readonly pricing: PricingPolicy,
  ) {}

  async execute(
    input: StartCounterOfferTopUpInput,
  ): Promise<{ intent: PaymentIntent; instructions: string; replayed: boolean }> {
    return this.transactions.run(async (tx) => {
      const found = await this.deals.findById(input.dealId, tx);
      const deal = requireBuyer(
        requireParticipant(found, input.actorUserId, input.dealId),
        input.actorUserId,
      );

      const counterOffer = await this.counterOffers.findPending(deal.id, tx);

      if (!counterOffer) {
        throw new NoPendingCounterOfferError();
      }

      const topUp = deal.settlementFor(
        counterOffer.price,
        this.pricing.platformFeeBasisPoints(),
      );

      // Sem diferença a cobrar, a aceitação não passa por aqui: fecha-se
      // directamente em `RespondCounterOfferUseCase`.
      if (!topUp.isPositive) {
        throw new ResourceConflictError(
          'Esta contraproposta não exige reforço. Aceita-a directamente.',
        );
      }

      const active = await this.intents.findActiveByDeal(deal.id, tx);

      if (active) {
        if (active.idempotencyKey === input.idempotencyKey) {
          return {
            intent: active,
            instructions: 'Autorize o reforço no seu telemóvel.',
            replayed: true,
          };
        }

        throw new ResourceConflictError(
          `Deal ${deal.reference} already has an active payment intent`,
        );
      }

      const created = await this.gateway.createIntent({
        dealReference: deal.reference,
        amount: topUp,
        payerPhone: input.payerPhone,
        idempotencyKey: input.idempotencyKey,
      });

      const intent = await this.intents.create(
        {
          id: this.ids.next(),
          dealId: deal.id,
          purpose: 'TOP_UP',
          counterOfferId: counterOffer.id,
          provider: this.gateway.provider,
          providerReference: created.providerReference,
          idempotencyKey: input.idempotencyKey,
          amountMinor: topUp.amountMinor,
          currency: topUp.currency,
          status: created.status === 'PENDING' ? 'PENDING' : 'FAILED',
          payerPhone: input.payerPhone,
          expiresAt: created.expiresAt,
        },
        tx,
      );

      await this.auditLog.record(
        {
          actorUserId: input.actorUserId,
          actorKind: 'USER',
          action: 'payment.top_up_created',
          subjectType: 'Deal',
          subjectId: deal.id,
          metadata: {
            counterOfferId: counterOffer.id,
            topUpMinor: topUp.amountMinor.toString(),
          },
        },
        tx,
      );

      return { intent, instructions: created.instructions, replayed: false };
    });
  }
}
