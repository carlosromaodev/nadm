import type { Money } from '@/shared/domain/money';

export const COUNTER_OFFER_STATUSES = ['PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED'] as const;

export type CounterOfferStatus = (typeof COUNTER_OFFER_STATUSES)[number];

/**
 * Os termos que o criador propôs em alternativa aos do pedido.
 *
 * Fica guardada mesmo depois de resolvida: é o histórico da negociação, e é a
 * prova do que cada lado propôs e quando. Sem ela, um pedido renegociado
 * mostraria só o acordo final, como se o primeiro nunca tivesse existido.
 */
export interface CounterOffer {
  readonly id: string;
  readonly dealId: string;
  readonly proposedByUserId: string;
  /** O preço anunciado que o criador pede, sem taxa de nenhum dos lados. */
  readonly price: Money;
  readonly slaHours: number;
  readonly message: string | null;
  readonly status: CounterOfferStatus;
  readonly expiresAt: Date;
  readonly resolvedAt: Date | null;
  readonly createdAt: Date;
}
