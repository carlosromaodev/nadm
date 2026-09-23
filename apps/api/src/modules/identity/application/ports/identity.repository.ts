import type { TxContext } from '@/shared/application/transaction';
import type { Account, User } from '../../domain/user';

export abstract class UsersRepository {
  abstract findById(id: string, tx?: TxContext): Promise<User | null>;

  abstract findByPhone(phone: string, tx?: TxContext): Promise<User | null>;

  /**
   * Eleva o nível de verificação. Só a aprovação de uma `IdentityVerification`
   * pela administração o faz subir para `IDENTITY` — nunca um caminho de
   * utilizador, e nunca um campo vindo do corpo do pedido.
   */
  /**
   * Suspende uma conta, com motivo.
   *
   * O efeito é imediato: a guarda de autenticação recusa qualquer pedido de
   * quem não está `ACTIVE`, e por isso não há sessão a expirar nem cache a
   * invalidar.
   */
  abstract suspend(
    userId: string,
    reason: string,
    at: Date,
    tx?: TxContext,
  ): Promise<void>;

  /** Levanta a suspensão. O motivo fica no registo de auditoria, não aqui. */
  abstract reinstate(userId: string, tx?: TxContext): Promise<void>;

  abstract setVerificationLevel(
    userId: string,
    level: User['verificationLevel'],
    tx?: TxContext,
  ): Promise<void>;
}

export abstract class AccountsRepository {
  abstract findById(id: string, tx?: TxContext): Promise<Account | null>;

  /** Toda a pessoa tem exactamente uma conta individual, criada no registo. */
  abstract findIndividualByUser(userId: string, tx?: TxContext): Promise<Account | null>;
}
