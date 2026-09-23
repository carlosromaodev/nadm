import type { TxContext } from '@/shared/application/transaction';
import type {
  IdentityVerification,
  IdentityVerificationStatus,
} from '../../domain/identity-verification';

export abstract class IdentityVerificationsRepository {
  abstract findById(id: string, tx?: TxContext): Promise<IdentityVerification | null>;

  /** A submissão à espera de decisão. Há no máximo uma por utilizador. */
  abstract findPendingByUser(
    userId: string,
    tx?: TxContext,
  ): Promise<IdentityVerification | null>;

  abstract listByUser(userId: string, tx?: TxContext): Promise<IdentityVerification[]>;

  /** A fila da administração, por ordem de chegada. */
  abstract listByStatus(
    status: IdentityVerificationStatus,
    limit: number,
    tx?: TxContext,
  ): Promise<IdentityVerification[]>;

  abstract create(
    verification: IdentityVerification,
    tx?: TxContext,
  ): Promise<void>;

  abstract save(verification: IdentityVerification, tx?: TxContext): Promise<void>;
}
