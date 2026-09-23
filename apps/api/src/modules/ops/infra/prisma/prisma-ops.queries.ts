import { Injectable } from '@nestjs/common';
import { clientFrom } from '@/core/database/prisma-transaction';
import { PrismaService } from '@/core/database/prisma.service';
import type { TxContext } from '@/shared/application/transaction';
import {
  AuditQueries,
  MetricsQueries,
  type AuditEntryView,
  type AuditFilter,
  type PlatformMetrics,
} from '../../application/ports/ops.repository';

@Injectable()
export class PrismaAuditQueries extends AuditQueries {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(filter: AuditFilter, tx?: TxContext): Promise<AuditEntryView[]> {
    const rows = await clientFrom(this.prisma, tx).auditLog.findMany({
      where: {
        ...(filter.subjectType ? { subjectType: filter.subjectType } : {}),
        ...(filter.subjectId ? { subjectId: filter.subjectId } : {}),
        ...(filter.actorUserId ? { actorUserId: filter.actorUserId } : {}),
        ...(filter.action ? { action: filter.action } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: filter.limit,
    });

    return rows.map((row) => ({
      id: row.id,
      actorUserId: row.actorUserId,
      actorKind: row.actorKind,
      action: row.action,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      metadata: (row.metadata ?? null) as Record<string, unknown> | null,
      createdAt: row.createdAt,
    }));
  }
}

/** Uma hora é o que separa uma intenção lenta de uma intenção presa. */
const INTENT_STUCK_MS = 60 * 60 * 1000;

@Injectable()
export class PrismaMetricsQueries extends MetricsQueries {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async snapshot(now: Date, tx?: TxContext): Promise<PlatformMetrics> {
    const client = clientFrom(this.prisma, tx);

    const [
      dealsCriados,
      dealsAceites,
      dealsConcluidos,
      dealsDisputados,
      divergenciasAbertas,
      eventosPorProcessar,
      intencoesPresas,
      disputasAbertas,
      levantamentosPorDecidir,
      identidadesPorDecidir,
    ] = await Promise.all([
      client.deal.count(),
      client.deal.count({ where: { acceptedAt: { not: null } } }),
      client.deal.count({ where: { status: 'PAID' } }),
      client.dispute.count(),
      client.reconciliationFinding.count({ where: { status: 'OPEN' } }),
      client.outboxEvent.count({ where: { processedAt: null } }),
      client.paymentIntent.count({
        where: {
          status: { in: ['CREATED', 'PENDING'] },
          createdAt: { lte: new Date(now.getTime() - INTENT_STUCK_MS) },
        },
      }),
      client.dispute.count({ where: { status: 'OPEN' } }),
      client.payout.count({ where: { status: 'REQUESTED' } }),
      client.identityVerification.count({ where: { status: 'PENDING' } }),
    ]);

    // Os totais de dinheiro vêm do razão, nunca das projecções (RN-103).
    const [saldos] = await client.$queryRaw<
      Array<{ retido: bigint; libertado: bigint; devolvido: bigint }>
    >`
      SELECT
        COALESCE(SUM(CASE WHEN account = 'ESCROW'
                          THEN (CASE WHEN direction = 'CREDIT' THEN amount_minor ELSE -amount_minor END)
                     END), 0) AS retido,
        COALESCE(SUM(CASE WHEN account = 'CREATOR_AVAILABLE' AND direction = 'CREDIT'
                          THEN amount_minor END), 0) AS libertado,
        COALESCE(SUM(CASE WHEN account = 'REFUNDS_PAYABLE' AND direction = 'CREDIT'
                          THEN amount_minor END), 0) AS devolvido
      FROM ledger_entries
    `;

    return {
      negocio: { dealsCriados, dealsAceites, dealsConcluidos, dealsDisputados },
      dinheiro: {
        retidoMinor: (saldos?.retido ?? 0n).toString(),
        libertadoMinor: (saldos?.libertado ?? 0n).toString(),
        devolvidoMinor: (saldos?.devolvido ?? 0n).toString(),
      },
      integridade: { divergenciasAbertas, eventosPorProcessar, intencoesPresas },
      filas: { disputasAbertas, levantamentosPorDecidir, identidadesPorDecidir },
    };
  }
}
