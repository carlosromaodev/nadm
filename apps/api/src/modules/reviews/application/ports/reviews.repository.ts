import type { TxContext } from '@/shared/application/transaction';
import type { Review } from '../../domain/review';
export abstract class ReviewsRepository {
  abstract findByDeal(dealId: string, tx?: TxContext): Promise<Review | null>;
  abstract listByProfile(profileId: string, tx?: TxContext): Promise<Review[]>;
  /** Atomic create-if-absent, backed by UNIQUE(deal_id). */
  abstract createIfAbsent(review: Review, tx?: TxContext): Promise<Review>;

  /**
   * Grava a resposta do criador.
   *
   * É a **única** escrita possível numa avaliação depois de publicada, e o
   * papel da aplicação só tem `UPDATE` nestas duas colunas — a nota e o texto
   * do comprador estão fora do seu alcance por permissão, não por disciplina.
   */
  abstract saveReply(
    id: string,
    reply: string,
    repliedAt: Date,
    tx?: TxContext,
  ): Promise<Review>;
}
