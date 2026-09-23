import { Injectable } from '@nestjs/common';
import { BusinessRuleError, ForbiddenActionError, ResourceConflictError } from '@/core/errors/domain-error';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { TransactionRunner } from '@/shared/application/transaction';
import { normalizePhone } from '../../domain/user';
import { UsersRepository } from '../ports/identity.repository';
import { DevSessionPolicy, DevSessionRepository } from '../ports/dev-session.repository';

export interface CreateDevSessionInput {
  displayName: string;
  phone?: string;
  role: 'BUYER' | 'CREATOR';
}

/** Conta isolada de demonstração, não autenticação por telefone nem OTP. */
@Injectable()
export class CreateDevSessionUseCase {
  constructor(private readonly transactions: TransactionRunner, private readonly sessions: DevSessionRepository,
    private readonly users: UsersRepository, private readonly policy: DevSessionPolicy,
    private readonly ids: IdGenerator, private readonly audit: AuditLogRepository) {}

  async execute(input: CreateDevSessionInput) {
    if (!this.policy.isEnabled()) throw new ForbiddenActionError('As contas de demonstração estão desactivadas.');
    const displayName = input.displayName.trim();
    if (displayName.length < 2 || displayName.length > 80) throw new BusinessRuleError('Indica um nome entre 2 e 80 caracteres.');
    const userId = this.ids.next();
    const phone = input.phone ? normalizePhone(input.phone) : `+2449${userId.replace(/\D/g, '').slice(-8).padStart(8, '0')}`;
    if (!/^\+2449\d{8}$/.test(phone)) throw new BusinessRuleError('Indica um número angolano com 9 algarismos.');
    return this.transactions.run(async (tx) => {
      if (await this.users.findByPhone(phone, tx)) {
        throw new ResourceConflictError('Este número já pertence a uma conta. Usa outra conta de demonstração; não foi iniciada sessão nessa conta.');
      }
      await this.sessions.create({ userId, accountId: this.ids.next(), displayName, phone, role: input.role }, tx);
      await this.audit.record({ actorUserId: userId, actorKind: 'USER', action: 'identity.dev_created',
        subjectType: 'User', subjectId: userId, metadata: { role: input.role, developmentOnly: true } }, tx);
      return { userId, displayName, role: input.role, developmentOnly: true as const };
    });
  }
}
