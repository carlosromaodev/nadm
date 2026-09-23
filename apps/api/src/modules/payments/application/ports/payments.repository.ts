import type { TxContext } from '@/shared/application/transaction';
import type { PaymentEvent, PaymentIntent } from '../../domain/payment-intent';
import type { PaymentIntentStatus, PaymentPurpose } from '../../domain/payment-intent';

export interface CreatePaymentIntentInput {
  id: string;
  dealId: string;
  purpose: PaymentPurpose;
  counterOfferId: string | null;
  provider: string;
  providerReference: string;
  idempotencyKey: string;
  amountMinor: bigint;
  currency: string;
  status: PaymentIntentStatus;
  payerPhone: string;
  expiresAt: Date;
}

export abstract class PaymentIntentsRepository {
  abstract findById(id: string, tx?: TxContext): Promise<PaymentIntent | null>;

  abstract findByProviderReference(
    providerReference: string,
    tx?: TxContext,
  ): Promise<PaymentIntent | null>;

  abstract findActiveByDeal(dealId: string, tx?: TxContext): Promise<PaymentIntent | null>;

  abstract create(input: CreatePaymentIntentInput, tx?: TxContext): Promise<PaymentIntent>;

  abstract markCaptured(id: string, capturedAt: Date, tx?: TxContext): Promise<void>;

  /**
   * Fecha a intenção ainda viva de um pedido que morreu sem ser pago.
   *
   * Deixá-la aberta seria deixar uma captura tardia com destino: o razão
   * receberia dinheiro de um `Deal` que já não existe para o receber.
   */
  abstract expireActiveByDeal(dealId: string, at: Date, tx?: TxContext): Promise<void>;
}

export interface RecordPaymentEventInput {
  id: string;
  paymentIntentId: string;
  providerEventId: string;
  type: string;
  payload: Record<string, unknown>;
  receivedAt: Date;
}

export abstract class PaymentEventsRepository {
  abstract findByProviderEventId(
    providerEventId: string,
    tx?: TxContext,
  ): Promise<PaymentEvent | null>;

  /**
   * Devolve `null` quando o evento já tinha sido registado. É a segunda camada
   * de idempotência: a mesma notificação entregue duas vezes não produz efeito
   * nenhum na segunda vez (RN-091).
   */
  abstract recordIfNew(
    input: RecordPaymentEventInput,
    tx?: TxContext,
  ): Promise<PaymentEvent | null>;

  abstract markProcessed(id: string, processedAt: Date, tx?: TxContext): Promise<void>;
}
