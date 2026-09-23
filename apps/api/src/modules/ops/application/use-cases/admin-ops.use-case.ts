import { Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import {
  BusinessRuleError,
  ForbiddenActionError,
  ResourceNotFoundError,
} from '@/core/errors/domain-error';
import { UsersRepository } from '@/modules/identity/application/ports/identity.repository';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { OutboxRepository } from '@/shared/application/ports/outbox.repository';
import { TransactionRunner } from '@/shared/application/transaction';
import {
  AuditQueries,
  MetricsQueries,
  type AuditEntryView,
  type AuditFilter,
  type PlatformMetrics,
} from '../ports/ops.repository';

/** Ninguém suspende a sua própria conta: seria trancar-se por fora. */
class CannotSuspendSelfError extends ForbiddenActionError {
  constructor() {
    super('An administrator cannot suspend their own account');
  }
}

export interface SuspendUserInput {
  reviewerUserId: string;
  userId: string;
  reason: string;
}

/**
 * Suspender uma conta.
 *
 * O efeito é imediato e não tem meio-termo: a guarda de autenticação recusa
 * qualquer pedido de quem não está `ACTIVE`. Os `Deal` em curso não são
 * tocados — suspender uma conta não é cancelar negócios de outras pessoas, e
 * desfazê-los exigiria decisões sobre dinheiro que isto não tem.
 */
@Injectable()
export class SuspendUserUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly users: UsersRepository,
    private readonly outbox: OutboxRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: SuspendUserInput): Promise<void> {
    const now = this.clock.now();
    const reason = input.reason.trim();

    if (!reason) {
      throw new BusinessRuleError('Suspender uma conta exige dizer porquê.');
    }

    if (input.reviewerUserId === input.userId) {
      throw new CannotSuspendSelfError();
    }

    return this.transactions.run(async (tx) => {
      const user = await this.users.findById(input.userId, tx);

      if (!user) {
        throw new ResourceNotFoundError('User', input.userId);
      }

      await this.users.suspend(user.id, reason, now, tx);

      await this.outbox.enqueue(
        { type: 'user.suspended', payload: { userId: user.id }, availableAt: now },
        tx,
      );

      // Sem o motivo na metadata? Não: aqui o motivo **tem** de ficar. É um
      // acto da plataforma contra uma pessoa, e a auditoria é o que o justifica
      // daqui a seis meses (SDD §15.3).
      await this.auditLog.record(
        {
          actorUserId: input.reviewerUserId,
          actorKind: 'USER',
          action: 'user.suspended',
          subjectType: 'User',
          subjectId: user.id,
          metadata: { reason },
        },
        tx,
      );
    });
  }
}

@Injectable()
export class ReinstateUserUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly users: UsersRepository,
    private readonly auditLog: AuditLogRepository,
  ) {}

  async execute(input: { reviewerUserId: string; userId: string; note: string }): Promise<void> {
    const note = input.note.trim();

    if (!note) {
      throw new BusinessRuleError('Levantar uma suspensão exige dizer porquê.');
    }

    return this.transactions.run(async (tx) => {
      const user = await this.users.findById(input.userId, tx);

      if (!user) {
        throw new ResourceNotFoundError('User', input.userId);
      }

      await this.users.reinstate(user.id, tx);

      await this.auditLog.record(
        {
          actorUserId: input.reviewerUserId,
          actorKind: 'USER',
          action: 'user.reinstated',
          subjectType: 'User',
          subjectId: user.id,
          metadata: { note },
        },
        tx,
      );
    });
  }
}

/**
 * A auditoria, consultável.
 *
 * Ler a auditoria é ver o que a administração fez — incluindo o que **esta**
 * administração fez. É por isso que a própria consulta não se regista: um
 * registo que crescesse a cada leitura tornava-se ilegível ao fim de um dia, e
 * quem lê já está identificado pelo guarda de papel.
 */
@Injectable()
export class QueryAuditUseCase {
  constructor(private readonly audit: AuditQueries) {}

  execute(filter: Partial<AuditFilter> = {}): Promise<AuditEntryView[]> {
    return this.audit.list({ ...filter, limit: filter.limit ?? 100 });
  }
}

/** O estado da plataforma num número de cada coisa. */
@Injectable()
export class GetPlatformMetricsUseCase {
  constructor(
    private readonly metrics: MetricsQueries,
    private readonly clock: Clock,
  ) {}

  execute(): Promise<PlatformMetrics> {
    return this.metrics.snapshot(this.clock.now());
  }
}
