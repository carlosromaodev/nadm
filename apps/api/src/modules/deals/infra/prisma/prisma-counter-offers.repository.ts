import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { clientFrom } from '@/core/database/prisma-transaction';
import { PrismaService } from '@/core/database/prisma.service';
import type { TxContext } from '@/shared/application/transaction';
import { Money } from '@/shared/domain/money';
import type { CounterOffer, CounterOfferStatus } from '../../domain/counter-offer';
import {
  CounterOffersRepository,
  type CreateCounterOfferInput,
} from '../../application/ports/counter-offers.repository';

type Row = Prisma.DealCounterOfferGetPayload<object>;

function toDomain(row: Row): CounterOffer {
  return {
    id: row.id,
    dealId: row.dealId,
    proposedByUserId: row.proposedByUserId,
    price: Money.fromMinor(row.priceMinor, row.currency.trim() as 'AOA'),
    slaHours: row.slaHours,
    message: row.message,
    status: row.status as CounterOfferStatus,
    expiresAt: row.expiresAt,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaCounterOffersRepository extends CounterOffersRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string, tx?: TxContext): Promise<CounterOffer | null> {
    const row = await clientFrom(this.prisma, tx).dealCounterOffer.findUnique({ where: { id } });

    return row ? toDomain(row) : null;
  }

  async findPending(dealId: string, tx?: TxContext): Promise<CounterOffer | null> {
    const row = await clientFrom(this.prisma, tx).dealCounterOffer.findFirst({
      where: { dealId, status: 'PENDING' },
    });

    return row ? toDomain(row) : null;
  }

  async listByDeal(dealId: string, tx?: TxContext): Promise<CounterOffer[]> {
    const rows = await clientFrom(this.prisma, tx).dealCounterOffer.findMany({
      where: { dealId },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map(toDomain);
  }

  async create(input: CreateCounterOfferInput, tx?: TxContext): Promise<CounterOffer> {
    const row = await clientFrom(this.prisma, tx).dealCounterOffer.create({
      data: {
        id: input.id,
        dealId: input.dealId,
        proposedByUserId: input.proposedByUserId,
        priceMinor: input.price.amountMinor,
        currency: input.price.currency,
        slaHours: input.slaHours,
        message: input.message,
        expiresAt: input.expiresAt,
        createdAt: input.createdAt,
      },
    });

    return toDomain(row);
  }

  async resolve(
    id: string,
    status: Exclude<CounterOfferStatus, 'PENDING'>,
    resolvedAt: Date,
    tx?: TxContext,
  ): Promise<void> {
    await clientFrom(this.prisma, tx).dealCounterOffer.update({
      where: { id },
      data: { status, resolvedAt },
    });
  }
}
