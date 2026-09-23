import type { TxContext } from '@/shared/application/transaction';
import type { Payout, PayoutStatus } from '../../domain/payout';

export interface PayoutListFilter {
  profileId?: string;
  status?: PayoutStatus;
  limit: number;
}

export abstract class PayoutsRepository {
  abstract findById(id: string, tx?: TxContext): Promise<Payout | null>;

  abstract list(filter: PayoutListFilter, tx?: TxContext): Promise<Payout[]>;

  abstract create(payout: Payout, tx?: TxContext): Promise<void>;

  abstract save(payout: Payout, tx?: TxContext): Promise<void>;

  /**
   * Serializa os pedidos de levantamento do mesmo criador (RN-053).
   *
   * Sem isto, dois pedidos simultâneos do saldo total lêem ambos o mesmo saldo
   * e passam ambos: a verificação em aplicação perde a corrida por construção.
   * O bloqueio é de linha, no perfil, e dura até ao fim da transacção.
   */
  abstract lockCreatorForUpdate(profileId: string, tx: TxContext): Promise<void>;
}
