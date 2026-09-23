import type { TxContext } from '@/shared/application/transaction';
import type { Deal } from '../../domain/deal';
import type { DealStatus } from '../../domain/deal-status';

export interface DealListFilter {
  userId: string;
  role: 'buyer' | 'creator';
  status?: DealStatus;
  limit: number;
}

export abstract class DealsRepository {
  /**
   * Devolve o `Deal` sem filtrar por participação: quem decide o acesso é o
   * caso de uso, e a decisão é sempre a mesma — não sendo parte, não existe.
   */
  abstract findById(id: string, tx?: TxContext): Promise<Deal | null>;

  abstract findByReference(reference: string, tx?: TxContext): Promise<Deal | null>;

  abstract listFor(filter: DealListFilter, tx?: TxContext): Promise<Deal[]>;

  /**
   * Pedidos por decidir cujo prazo de resposta já passou (T13).
   *
   * A consulta é do agendador, não de um utilizador: não filtra por
   * participação porque não há actor nenhum a quem a filtrar.
   */
  abstract listExpiredProposals(now: Date, limit: number, tx?: TxContext): Promise<Deal[]>;

  /** Entregas à espera de resposta do comprador desde antes de `deliveredBefore` (T10). */
  abstract listPendingAutoApproval(
    deliveredBefore: Date,
    limit: number,
    tx?: TxContext,
  ): Promise<Deal[]>;

  abstract create(deal: Deal, tx?: TxContext): Promise<void>;

  abstract save(deal: Deal, tx?: TxContext): Promise<void>;

  /**
   * Grava um `Deal` cujos **valores e snapshot mudaram** — o que só acontece
   * quando uma contraproposta é aceite (T5).
   *
   * Está à parte de `save` de propósito. O normal é os valores de um `Deal`
   * serem imutáveis depois de criado (RN-041), e uma escrita que os altera tem
   * de ser fácil de encontrar e difícil de fazer por acidente.
   */
  abstract saveRenegotiated(deal: Deal, tx?: TxContext): Promise<void>;
}

/** Gera a referência legível exposta ao utilizador, em vez do UUID. */
export abstract class DealReferenceGenerator {
  abstract next(tx?: TxContext): Promise<string>;
}
