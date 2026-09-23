import { Injectable } from '@nestjs/common';
import { ResourceConflictError } from '@/core/errors/domain-error';
import {
  requireBuyer,
  requireParticipant,
} from '@/modules/deals/application/use-cases/deal-access';
import { DealsRepository } from '@/modules/deals/application/ports/deals.repository';
import { InvalidDealTransitionError } from '@/modules/deals/domain/errors';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { TransactionRunner } from '@/shared/application/transaction';
import type { PaymentIntent } from '../../domain/payment-intent';
import { PaymentsGateway } from '../ports/payments.gateway';
import { PaymentIntentsRepository } from '../ports/payments.repository';

export interface StartDealPaymentInput {
  actorUserId: string;
  dealId: string;
  payerPhone: string;
  /** Cabeçalho `Idempotency-Key`. Repetir a chave devolve a mesma intenção. */
  idempotencyKey: string;
}

export interface StartedPayment {
  intent: PaymentIntent;
  instructions: string;
  /** Verdadeiro quando a chave já tinha sido usada e nada de novo foi criado. */
  replayed: boolean;
}

/**
 * Emite a intenção de pagamento no parceiro.
 *
 * Primeira camada de idempotência (RN-090): a mesma `Idempotency-Key` devolve a
 * intenção que já existe em vez de criar outra e cobrar duas vezes.
 */
@Injectable()
export class StartDealPaymentUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly deals: DealsRepository,
    private readonly intents: PaymentIntentsRepository,
    private readonly gateway: PaymentsGateway,
    private readonly auditLog: AuditLogRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: StartDealPaymentInput): Promise<StartedPayment> {
    return this.transactions.run(async (tx) => {
      const found = await this.deals.findById(input.dealId, tx);
      const deal = requireBuyer(
        requireParticipant(found, input.actorUserId, input.dealId),
        input.actorUserId,
      );

      // O comprador paga um pedido acabado de criar: é o pagamento que o
      // torna decidível pelo criador (DP-15).
      if (deal.status !== 'PROPOSED') {
        throw new InvalidDealTransitionError(deal.status, 'ACCEPTED');
      }

      if (deal.escrowStatus !== 'PENDING') {
        throw new ResourceConflictError(`Deal ${deal.reference} is already paid`);
      }

      const active = await this.intents.findActiveByDeal(deal.id, tx);

      if (active) {
        if (active.idempotencyKey === input.idempotencyKey) {
          return {
            intent: active,
            instructions: 'Autorize o pagamento no seu telemóvel.',
            replayed: true,
          };
        }

        // RN-092: já existe uma intenção activa, e não é esta.
        throw new ResourceConflictError(
          `Deal ${deal.reference} already has an active payment intent`,
        );
      }

      const created = await this.gateway.createIntent({
        dealReference: deal.reference,
        amount: deal.amount,
        payerPhone: input.payerPhone,
        idempotencyKey: input.idempotencyKey,
      });

      const intent = await this.intents.create(
        {
          id: this.ids.next(),
          dealId: deal.id,
          purpose: 'INITIAL',
          counterOfferId: null,
          provider: this.gateway.provider,
          providerReference: created.providerReference,
          idempotencyKey: input.idempotencyKey,
          amountMinor: deal.amount.amountMinor,
          currency: deal.amount.currency,
          status: created.status === 'PENDING' ? 'PENDING' : mapStatus(created.status),
          payerPhone: input.payerPhone,
          expiresAt: created.expiresAt,
        },
        tx,
      );

      await this.auditLog.record(
        {
          actorUserId: input.actorUserId,
          actorKind: 'USER',
          action: 'payment.intent_created',
          subjectType: 'Deal',
          subjectId: deal.id,
          metadata: { providerReference: created.providerReference },
        },
        tx,
      );

      return { intent, instructions: created.instructions, replayed: false };
    });
  }
}

function mapStatus(status: 'PENDING' | 'CAPTURED' | 'FAILED' | 'EXPIRED') {
  return status === 'CAPTURED' ? 'CAPTURED' : status === 'FAILED' ? 'FAILED' : 'EXPIRED';
}
