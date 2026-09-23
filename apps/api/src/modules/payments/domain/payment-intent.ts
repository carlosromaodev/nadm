export type PaymentIntentStatus =
  | 'CREATED'
  | 'PENDING'
  | 'CAPTURED'
  | 'FAILED'
  | 'EXPIRED'
  | 'REVERSED';

/**
 * Para que serve a cobrança.
 *
 * `TOP_UP` é o reforço da diferença quando o comprador aceita uma
 * contraproposta mais cara: o escrow tem de passar a valer o preço novo, e é a
 * captura deste reforço que faz T5 acontecer.
 */
export type PaymentPurpose = 'INITIAL' | 'TOP_UP';

export interface PaymentIntent {
  readonly id: string;
  readonly dealId: string;
  readonly purpose: PaymentPurpose;
  /** A contraproposta que este reforço paga. Só preenchido em `TOP_UP`. */
  readonly counterOfferId: string | null;
  readonly provider: string;
  readonly providerReference: string;
  readonly idempotencyKey: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly status: PaymentIntentStatus;
  readonly payerPhone: string;
  readonly expiresAt: Date;
  readonly capturedAt: Date | null;
}

export interface PaymentEvent {
  readonly id: string;
  readonly paymentIntentId: string;
  readonly providerEventId: string;
  readonly type: string;
  readonly receivedAt: Date;
  readonly processedAt: Date | null;
}
