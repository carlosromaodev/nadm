import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { clientFrom } from '@/core/database/prisma-transaction';
import { PrismaService } from '@/core/database/prisma.service';
import type { TxContext } from '@/shared/application/transaction';
import { Money } from '@/shared/domain/money';
import { Deal, type OfferSnapshot } from '../../domain/deal';
import type { DealStatus, EscrowStatus } from '../../domain/deal-status';
import {
  DealReferenceGenerator,
  DealsRepository,
  type DealListFilter,
} from '../../application/ports/deals.repository';

const WITH_CREATOR = {
  creatorProfile: { select: { userId: true } },
} satisfies Prisma.DealInclude;

type DealRow = Prisma.DealGetPayload<{ include: typeof WITH_CREATOR }>;

function toDomain(row: DealRow): Deal {
  const currency = row.currency.trim() as 'AOA';

  return Deal.reconstitute({
    id: row.id,
    reference: row.reference,
    buyerUserId: row.buyerUserId,
    buyerAccountId: row.buyerAccountId,
    creatorProfileId: row.creatorProfileId,
    creatorUserId: row.creatorProfile.userId,
    offerId: row.offerId,
    windowId: row.windowId,
    offerSnapshot: row.offerSnapshot as unknown as OfferSnapshot,
    status: row.status as DealStatus,
    escrowStatus: row.escrowStatus as EscrowStatus,
    amount: Money.fromMinor(row.amountMinor, currency),
    platformFee: Money.fromMinor(row.platformFeeMinor, currency),
    creatorNet: Money.fromMinor(row.creatorNetMinor, currency),
    brief: row.brief,
    dueAt: row.dueAt,
    expiresAt: row.expiresAt,
    acceptedAt: row.acceptedAt,
    deliveredAt: row.deliveredAt,
    approvedAt: row.approvedAt,
    settledAt: row.settledAt,
    closedAt: row.closedAt,
    revisionCount: row.revisionCount,
    lastMessageAt: row.lastMessageAt,
    createdAt: row.createdAt,
  });
}

@Injectable()
export class PrismaDealsRepository extends DealsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string, tx?: TxContext): Promise<Deal | null> {
    const row = await clientFrom(this.prisma, tx).deal.findUnique({
      where: { id },
      include: WITH_CREATOR,
    });

    return row ? toDomain(row) : null;
  }

  async findByReference(reference: string, tx?: TxContext): Promise<Deal | null> {
    const row = await clientFrom(this.prisma, tx).deal.findUnique({
      where: { reference },
      include: WITH_CREATOR,
    });

    return row ? toDomain(row) : null;
  }

  async listFor(filter: DealListFilter, tx?: TxContext): Promise<Deal[]> {
    // A filtragem por participação acontece na consulta: um pedido alheio nunca
    // chega a sair da base de dados.
    const where: Prisma.DealWhereInput =
      filter.role === 'buyer'
        ? { buyerUserId: filter.userId }
        : { creatorProfile: { userId: filter.userId } };

    const rows = await clientFrom(this.prisma, tx).deal.findMany({
      where: { ...where, ...(filter.status ? { status: filter.status } : {}) },
      include: WITH_CREATOR,
      orderBy: { createdAt: 'desc' },
      take: filter.limit,
    });

    return rows.map(toDomain);
  }

  async listExpiredProposals(now: Date, limit: number, tx?: TxContext): Promise<Deal[]> {
    const rows = await clientFrom(this.prisma, tx).deal.findMany({
      // Os dois lados da negociação: em `PROPOSED` quem não respondeu foi o
      // criador, em `COUNTER_OFFERED` foi o comprador. A consequência é a
      // mesma, e o índice parcial de 012 cobre ambos.
      where: { status: { in: ['PROPOSED', 'COUNTER_OFFERED'] }, expiresAt: { lte: now } },
      include: WITH_CREATOR,
      orderBy: { expiresAt: 'asc' },
      take: limit,
    });

    return rows.map(toDomain);
  }

  async listPendingAutoApproval(
    deliveredBefore: Date,
    limit: number,
    tx?: TxContext,
  ): Promise<Deal[]> {
    const rows = await clientFrom(this.prisma, tx).deal.findMany({
      where: { status: 'DELIVERED', deliveredAt: { lte: deliveredBefore } },
      include: WITH_CREATOR,
      orderBy: { deliveredAt: 'asc' },
      take: limit,
    });

    return rows.map(toDomain);
  }

  async create(deal: Deal, tx?: TxContext): Promise<void> {
    const props = deal.toProps();

    await clientFrom(this.prisma, tx).deal.create({
      data: {
        id: props.id,
        reference: props.reference,
        buyerUserId: props.buyerUserId,
        buyerAccountId: props.buyerAccountId,
        creatorProfileId: props.creatorProfileId,
        offerId: props.offerId,
        windowId: props.windowId,
        offerSnapshot: props.offerSnapshot as unknown as Prisma.InputJsonValue,
        status: props.status,
        escrowStatus: props.escrowStatus,
        amountMinor: props.amount.amountMinor,
        platformFeeMinor: props.platformFee.amountMinor,
        creatorNetMinor: props.creatorNet.amountMinor,
        currency: props.amount.currency,
        brief: props.brief,
        dueAt: props.dueAt,
        expiresAt: props.expiresAt,
        lastMessageAt: props.lastMessageAt,
        createdAt: props.createdAt,
      },
    });
  }

  /**
   * T5 — a única escrita que altera os valores de um `Deal` depois de criado.
   *
   * A regra normal é o contrário: preço e snapshot são imutáveis (RN-041). Uma
   * contraproposta aceite é o acordo a mudar, e isso tem de ser fácil de
   * encontrar em revisão — daí estar à parte de `save`.
   */
  async saveRenegotiated(deal: Deal, tx?: TxContext): Promise<void> {
    const props = deal.toProps();

    await clientFrom(this.prisma, tx).deal.update({
      where: { id: props.id },
      data: {
        status: props.status,
        escrowStatus: props.escrowStatus,
        offerSnapshot: props.offerSnapshot as unknown as Prisma.InputJsonValue,
        amountMinor: props.amount.amountMinor,
        platformFeeMinor: props.platformFee.amountMinor,
        creatorNetMinor: props.creatorNet.amountMinor,
        dueAt: props.dueAt,
        expiresAt: props.expiresAt,
        closedAt: props.closedAt,
        lastMessageAt: props.lastMessageAt,
      },
    });
  }

  async save(deal: Deal, tx?: TxContext): Promise<void> {
    const props = deal.toProps();

    // `offerSnapshot`, valores e partes não entram no update: são imutáveis
    // depois da criação (RN-041).
    await clientFrom(this.prisma, tx).deal.update({
      where: { id: props.id },
      data: {
        status: props.status,
        escrowStatus: props.escrowStatus,
        dueAt: props.dueAt,
        // `expiresAt` entra no update porque T3 o limpa: um pedido recusado
        // deixa de ter prazo de resposta por cumprir.
        expiresAt: props.expiresAt,
        acceptedAt: props.acceptedAt,
        deliveredAt: props.deliveredAt,
        approvedAt: props.approvedAt,
        settledAt: props.settledAt,
        closedAt: props.closedAt,
        revisionCount: props.revisionCount,
        lastMessageAt: props.lastMessageAt,
      },
    });
  }
}

@Injectable()
export class PrismaDealReferenceGenerator extends DealReferenceGenerator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async next(tx?: TxContext): Promise<string> {
    const [{ nextval }] = await clientFrom(this.prisma, tx).$queryRaw<
      [{ nextval: bigint }]
    >`SELECT nextval('deal_reference_seq')`;

    const year = new Date().getUTCFullYear();

    return `NDM-${year}-${nextval.toString().padStart(7, '0')}`;
  }
}
