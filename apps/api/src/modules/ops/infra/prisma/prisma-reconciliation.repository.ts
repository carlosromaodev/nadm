import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { clientFrom } from '@/core/database/prisma-transaction';
import { PrismaService } from '@/core/database/prisma.service';
import type { TxContext } from '@/shared/application/transaction';
import {
  FindingsRepository,
  ReconciliationQueries,
} from '../../application/ports/reconciliation.repository';
import {
  ReconciliationFinding,
  type FindingKind,
  type FindingSeverity,
  type FindingStatus,
} from '../../domain/reconciliation';

type Row = Prisma.ReconciliationFindingGetPayload<object>;

function toDomain(row: Row): ReconciliationFinding {
  return ReconciliationFinding.reconstitute({
    id: row.id,
    kind: row.kind as FindingKind,
    severity: row.severity as FindingSeverity,
    status: row.status as FindingStatus,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    detail: row.detail,
    metadata: (row.metadata ?? {}) as Record<string, string>,
    detectedAt: row.detectedAt,
    resolvedAt: row.resolvedAt,
    resolvedByUserId: row.resolvedByUserId,
    resolutionNote: row.resolutionNote,
  });
}

@Injectable()
export class PrismaFindingsRepository extends FindingsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string, tx?: TxContext): Promise<ReconciliationFinding | null> {
    const row = await clientFrom(this.prisma, tx).reconciliationFinding.findUnique({
      where: { id },
    });

    return row ? toDomain(row) : null;
  }

  async list(
    filter: { status?: FindingStatus; limit: number },
    tx?: TxContext,
  ): Promise<ReconciliationFinding[]> {
    const rows = await clientFrom(this.prisma, tx).reconciliationFinding.findMany({
      where: filter.status ? { status: filter.status } : {},
      // Críticas primeiro: é a ordem por que uma pessoa as deve ler.
      orderBy: [{ severity: 'desc' }, { detectedAt: 'desc' }],
      take: filter.limit,
    });

    return rows.map(toDomain);
  }

  async countOpen(tx?: TxContext): Promise<number> {
    return clientFrom(this.prisma, tx).reconciliationFinding.count({
      where: { status: 'OPEN' },
    });
  }

  async recordIfNew(finding: ReconciliationFinding, tx?: TxContext): Promise<boolean> {
    const props = finding.toProps();

    try {
      await clientFrom(this.prisma, tx).reconciliationFinding.create({
        data: {
          id: props.id,
          kind: props.kind,
          severity: props.severity,
          status: props.status,
          subjectType: props.subjectType,
          subjectId: props.subjectId,
          fingerprint: finding.fingerprint,
          detail: props.detail,
          metadata: props.metadata as Prisma.InputJsonValue,
          detectedAt: props.detectedAt,
        },
      });

      return true;
    } catch (error) {
      // `reconciliation_findings_one_open_idx`: já havia uma aberta igual.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }

      throw error;
    }
  }

  async save(finding: ReconciliationFinding, tx?: TxContext): Promise<void> {
    const props = finding.toProps();

    await clientFrom(this.prisma, tx).reconciliationFinding.update({
      where: { id: props.id },
      data: {
        status: props.status,
        resolvedAt: props.resolvedAt,
        resolvedByUserId: props.resolvedByUserId,
        resolutionNote: props.resolutionNote,
      },
    });
  }
}

/**
 * As consultas cruzadas, em SQL directo.
 *
 * São agregações sobre tabelas inteiras e comparações entre elas — o tipo de
 * coisa que o ORM exprime mal e o Postgres exprime bem. Todas são leitura pura.
 */
@Injectable()
export class PrismaReconciliationQueries extends ReconciliationQueries {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async stuckPaymentIntents(before: Date, tx?: TxContext) {
    return clientFrom(this.prisma, tx).$queryRaw<
      Array<{ id: string; dealId: string; since: Date }>
    >`
      SELECT id, deal_id AS "dealId", created_at AS since
        FROM payment_intents
       WHERE status IN ('CREATED', 'PENDING')
         AND created_at <= ${before}
       ORDER BY created_at ASC
       LIMIT 200
    `;
  }

  async capturesWithoutLedger(tx?: TxContext) {
    // Uma captura confirmada tem sempre a sua entrada no razão (E1). Sem ela,
    // ou o dinheiro entrou sem ser registado, ou a marca de captura está errada.
    return clientFrom(this.prisma, tx).$queryRaw<
      Array<{ dealId: string; intentId: string; capturedAt: Date }>
    >`
      SELECT pi.deal_id AS "dealId", pi.id AS "intentId", pi.captured_at AS "capturedAt"
        FROM payment_intents pi
       WHERE pi.status = 'CAPTURED'
         AND NOT EXISTS (
               SELECT 1 FROM ledger_transactions lt
                WHERE lt.deal_id = pi.deal_id AND lt.kind = 'ESCROW_FUNDING'
             )
       LIMIT 200
    `;
  }

  async walletDivergences(tx?: TxContext) {
    // O razão é a fonte de verdade; a carteira é projecção (RN-103). O sinal
    // inverte-se porque `CREATOR_AVAILABLE` é conta de passivo.
    return clientFrom(this.prisma, tx).$queryRaw<
      Array<{ profileId: string; ledgerMinor: bigint; walletMinor: bigint }>
    >`
      SELECT w.profile_id AS "profileId",
             COALESCE(l.saldo, 0) AS "ledgerMinor",
             w.available_minor AS "walletMinor"
        FROM wallets w
        LEFT JOIN (
               SELECT subject_id,
                      SUM(CASE WHEN direction = 'CREDIT' THEN amount_minor ELSE -amount_minor END) AS saldo
                 FROM ledger_entries
                WHERE account = 'CREATOR_AVAILABLE'
                GROUP BY subject_id
             ) l ON l.subject_id = w.profile_id
       WHERE w.available_minor <> COALESCE(l.saldo, 0)
       LIMIT 200
    `;
  }

  async stuckPayouts(before: Date, tx?: TxContext) {
    return clientFrom(this.prisma, tx).$queryRaw<
      Array<{ id: string; profileId: string; since: Date }>
    >`
      SELECT id, profile_id AS "profileId", COALESCE(approved_at, requested_at) AS since
        FROM payouts
       WHERE status = 'PROCESSING'
         AND COALESCE(approved_at, requested_at) <= ${before}
       ORDER BY requested_at ASC
       LIMIT 200
    `;
  }

  async unbalancedLedgerTransactions(tx?: TxContext) {
    // RN-100 em verificação contínua. Se isto alguma vez devolver uma linha,
    // há um caminho de escrita que não passou pelo domínio.
    return clientFrom(this.prisma, tx).$queryRaw<
      Array<{ transactionId: string; differenceMinor: bigint }>
    >`
      SELECT transaction_id AS "transactionId",
             SUM(CASE WHEN direction = 'DEBIT' THEN amount_minor ELSE -amount_minor END) AS "differenceMinor"
        FROM ledger_entries
       GROUP BY transaction_id
      HAVING SUM(CASE WHEN direction = 'DEBIT' THEN amount_minor ELSE -amount_minor END) <> 0
       LIMIT 200
    `;
  }

  async escrowOnClosedDeals(tx?: TxContext) {
    return clientFrom(this.prisma, tx).$queryRaw<
      Array<{ dealId: string; reference: string; heldMinor: bigint }>
    >`
      SELECT d.id AS "dealId", d.reference, COALESCE(-e.saldo, 0) AS "heldMinor"
        FROM deals d
        JOIN (
               SELECT subject_id,
                      SUM(CASE WHEN direction = 'DEBIT' THEN amount_minor ELSE -amount_minor END) AS saldo
                 FROM ledger_entries
                WHERE account = 'ESCROW'
                GROUP BY subject_id
             ) e ON e.subject_id = d.id
       WHERE d.status IN ('PAID', 'DECLINED', 'REFUNDED', 'EXPIRED')
         AND e.saldo <> 0
       LIMIT 200
    `;
  }
}
