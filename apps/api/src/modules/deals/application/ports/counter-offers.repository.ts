import type { TxContext } from '@/shared/application/transaction';
import type { Money } from '@/shared/domain/money';
import type { CounterOffer, CounterOfferStatus } from '../../domain/counter-offer';

export interface CreateCounterOfferInput {
  id: string;
  dealId: string;
  proposedByUserId: string;
  price: Money;
  slaHours: number;
  message: string | null;
  expiresAt: Date;
  createdAt: Date;
}

export abstract class CounterOffersRepository {
  abstract findById(id: string, tx?: TxContext): Promise<CounterOffer | null>;

  /**
   * A que está à espera de resposta. Há no máximo uma por `Deal`, e quem o
   * garante é um índice único parcial no Postgres — verificar em aplicação
   * perderia a corrida entre duas contrapropostas simultâneas.
   */
  abstract findPending(dealId: string, tx?: TxContext): Promise<CounterOffer | null>;

  abstract listByDeal(dealId: string, tx?: TxContext): Promise<CounterOffer[]>;

  abstract create(input: CreateCounterOfferInput, tx?: TxContext): Promise<CounterOffer>;

  abstract resolve(
    id: string,
    status: Exclude<CounterOfferStatus, 'PENDING'>,
    resolvedAt: Date,
    tx?: TxContext,
  ): Promise<void>;
}
