import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { clientFrom } from '@/core/database/prisma-transaction';
import { PrismaService } from '@/core/database/prisma.service';
import type { TxContext } from '@/shared/application/transaction';
import { DisputesRepository } from '../../application/ports/disputes.repository';
import {
  Dispute,
  DisputeAlreadyOpenError,
  type DisputeResolution,
  type DisputeStatus,
} from '../../domain/dispute';

type Row = Prisma.DisputeGetPayload<object>;

function toDomain(row: Row): Dispute {
  return Dispute.reconstitute({
    id: row.id,
    dealId: row.dealId,
    openedByUserId: row.openedByUserId,
    reason: row.reason,
    status: row.status as DisputeStatus,
    resolution: (row.resolution as DisputeResolution | null) ?? null,
    decidedByUserId: row.decidedByUserId,
    decisionNote: row.decisionNote,
    openedAt: row.openedAt,
    decidedAt: row.decidedAt,
  });
}

@Injectable()
export class PrismaDisputesRepository extends DisputesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string, tx?: TxContext): Promise<Dispute | null> {
    const row = await clientFrom(this.prisma, tx).dispute.findUnique({ where: { id } });

    return row ? toDomain(row) : null;
  }

  async findOpenByDeal(dealId: string, tx?: TxContext): Promise<Dispute | null> {
    const row = await clientFrom(this.prisma, tx).dispute.findFirst({
      where: { dealId, status: 'OPEN' },
    });

    return row ? toDomain(row) : null;
  }

  async listByDeal(dealId: string, tx?: TxContext): Promise<Dispute[]> {
    const rows = await clientFrom(this.prisma, tx).dispute.findMany({
      where: { dealId },
      orderBy: { openedAt: 'desc' },
    });

    return rows.map(toDomain);
  }

  async listOpen(limit: number, tx?: TxContext): Promise<Dispute[]> {
    const rows = await clientFrom(this.prisma, tx).dispute.findMany({
      where: { status: 'OPEN' },
      orderBy: { openedAt: 'asc' },
      take: limit,
    });

    return rows.map(toDomain);
  }

  async create(dispute: Dispute, tx?: TxContext): Promise<void> {
    const props = dispute.toProps();

    try {
      await clientFrom(this.prisma, tx).dispute.create({
        data: {
          id: props.id,
          dealId: props.dealId,
          openedByUserId: props.openedByUserId,
          reason: props.reason,
          status: props.status,
          openedAt: props.openedAt,
        },
      });
    } catch (error) {
      // `disputes_one_open_idx` é o que resolve a corrida entre as duas partes
      // a abrir disputa ao mesmo tempo. Chegar aqui significa que a outra ganhou.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DisputeAlreadyOpenError();
      }

      throw error;
    }
  }

  async save(dispute: Dispute, tx?: TxContext): Promise<void> {
    const props = dispute.toProps();

    // O motivo e quem abriu não entram: o que muda numa disputa é como acabou.
    await clientFrom(this.prisma, tx).dispute.update({
      where: { id: props.id },
      data: {
        status: props.status,
        resolution: props.resolution,
        decidedByUserId: props.decidedByUserId,
        decisionNote: props.decisionNote,
        decidedAt: props.decidedAt,
      },
    });
  }
}
