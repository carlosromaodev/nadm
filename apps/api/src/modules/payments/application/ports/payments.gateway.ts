import type { Money } from '@/shared/domain/money';

export type ProviderIntentStatus = 'PENDING' | 'CAPTURED' | 'FAILED' | 'EXPIRED';

export interface CreateIntentInput {
  dealReference: string;
  amount: Money;
  payerPhone: string;
  idempotencyKey: string;
}

export interface CreatedIntent {
  providerReference: string;
  status: ProviderIntentStatus;
  expiresAt: Date;
  /** O que dizer ao comprador para autorizar no telemóvel. */
  instructions: string;
}

export interface ProviderIntentState {
  providerReference: string;
  status: ProviderIntentStatus;
  capturedAmount?: Money;
}

export interface ProviderEvent {
  providerEventId: string;
  providerReference: string;
  type: 'payment.captured' | 'payment.failed' | 'payment.expired';
  capturedAmount?: Money;
  occurredAt: Date;
  raw: Record<string, unknown>;
}

/**
 * O parceiro MULTICAIXA Express ainda não está fechado (DP-04). Toda a
 * integração vive atrás desta porta, e é por isso que F1 corre inteira com a
 * implementação falsa — sem rede, sem contrato assinado.
 */
export abstract class PaymentsGateway {
  abstract readonly provider: string;

  abstract createIntent(input: CreateIntentInput): Promise<CreatedIntent>;

  abstract getIntent(providerReference: string): Promise<ProviderIntentState>;

  abstract verifyWebhookSignature(rawBody: string, headers: Record<string, string>): boolean;

  abstract parseWebhookEvent(rawBody: string): ProviderEvent;
}
