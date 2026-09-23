import type { TxContext } from '@/shared/application/transaction';
import type { Dispute } from '../../domain/dispute';

export abstract class DisputesRepository {
  abstract findById(id: string, tx?: TxContext): Promise<Dispute | null>;

  /**
   * A disputa aberta deste `Deal`, se houver.
   *
   * É a consulta que trava a libertação do escrow (RN-048), e por isso corre
   * dentro da mesma transacção da aprovação — uma disputa aberta entre a
   * verificação e o lançamento não pode passar despercebida.
   */
  abstract findOpenByDeal(dealId: string, tx?: TxContext): Promise<Dispute | null>;

  abstract listByDeal(dealId: string, tx?: TxContext): Promise<Dispute[]>;

  /** A fila da administração, por ordem de chegada. */
  abstract listOpen(limit: number, tx?: TxContext): Promise<Dispute[]>;

  abstract create(dispute: Dispute, tx?: TxContext): Promise<void>;

  abstract save(dispute: Dispute, tx?: TxContext): Promise<void>;
}
