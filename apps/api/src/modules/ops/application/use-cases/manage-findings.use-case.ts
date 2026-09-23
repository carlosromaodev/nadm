import { Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { ResourceNotFoundError } from '@/core/errors/domain-error';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { TransactionRunner } from '@/shared/application/transaction';
import type { FindingStatus, ReconciliationFinding } from '../../domain/reconciliation';
import { FindingsRepository } from '../ports/reconciliation.repository';

/** A lista de divergências. Abertas por omissão, que é o que interessa ver. */
@Injectable()
export class ListFindingsUseCase {
  constructor(private readonly findings: FindingsRepository) {}

  execute(input: { status?: FindingStatus; limit?: number } = {}) {
    return this.findings.list({
      status: input.status ?? 'OPEN',
      limit: input.limit ?? 100,
    });
  }
}

export interface CloseFindingInput {
  reviewerUserId: string;
  findingId: string;
  /** `RESOLVED` corrigiu-se; `ACCEPTED` decidiu-se que está bem assim. */
  outcome: 'RESOLVED' | 'ACCEPTED';
  note: string;
}

/**
 * Fechar uma divergência.
 *
 * **Não corrige nada** — quem corrige é quem vai à causa. O que isto faz é
 * registar que uma pessoa olhou, decidiu e disse o quê. A distinção entre
 * resolvida e aceite importa: uma divergência aceite sem nada mudar é um sinal
 * sobre o sistema, não sobre aquele dia.
 */
@Injectable()
export class CloseFindingUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly findings: FindingsRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: CloseFindingInput): Promise<ReconciliationFinding> {
    const now = this.clock.now();

    return this.transactions.run(async (tx) => {
      const finding = await this.findings.findById(input.findingId, tx);

      if (!finding) {
        throw new ResourceNotFoundError('ReconciliationFinding', input.findingId);
      }

      if (input.outcome === 'RESOLVED') {
        finding.resolve(input.reviewerUserId, input.note, now);
      } else {
        finding.accept(input.reviewerUserId, input.note, now);
      }

      await this.findings.save(finding, tx);

      await this.auditLog.record(
        {
          actorUserId: input.reviewerUserId,
          actorKind: 'USER',
          action: `reconciliation.${input.outcome.toLowerCase()}`,
          subjectType: 'ReconciliationFinding',
          subjectId: finding.id,
          metadata: { kind: finding.kind, severity: finding.severity },
        },
        tx,
      );

      return finding;
    });
  }
}
