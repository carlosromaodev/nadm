import type { TxContext } from '@/shared/application/transaction';

export interface CreateDevIdentity {
  userId: string;
  accountId: string;
  displayName: string;
  phone: string;
  role: 'BUYER' | 'CREATOR';
}

export abstract class DevSessionRepository {
  abstract create(input: CreateDevIdentity, tx: TxContext): Promise<void>;
}

export abstract class DevSessionPolicy {
  abstract isEnabled(): boolean;
}
