import type { TxContext } from '../transaction';

export type AuditActorKind = 'USER' | 'SYSTEM' | 'PROVIDER';

export interface AuditLogInput {
  actorUserId: string | null;
  actorKind: AuditActorKind;
  action: string;
  subjectType: string;
  subjectId: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

/** Imutável por permissão de base de dados: só SELECT e INSERT. Ver SDD §15.3. */
export abstract class AuditLogRepository {
  abstract record(entry: AuditLogInput, tx?: TxContext): Promise<void>;
}
