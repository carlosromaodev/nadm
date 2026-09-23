import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { clientFrom } from '@/core/database/prisma-transaction';
import { PrismaService } from '@/core/database/prisma.service';
import type { TxContext } from '@/shared/application/transaction';
import { Money } from '@/shared/domain/money';
import { Payout, type PayoutMethod, type PayoutStatus } from '../../domain/payout';
import {
  PayoutsRepository,
  type PayoutListFilter,
} from '../../application/ports/payouts.repository';

type Row = Prisma.PayoutGetPayload<object>;

function toDomain(row: Row): Payout {
  const currency = row.currency.trim() as 'AOA';

  return Payout.reconstitute({
    id: row.id,
    profileId: row.profileId,
    requestedByUserId: row.requestedByUserId,
    amount: Money.fromMinor(row.amountMinor, currency),
    fee: Money.fromMinor(row.feeMinor, currency),
    net: Money.fromMinor(row.netMinor, currency),
    method: row.method as PayoutMethod,
    destination: row.destination,
    destinationMasked: row.destinationMasked,
    status: row.status as PayoutStatus,
    providerReference: row.providerReference,
    failureReason: row.failureReason,
    reviewedByUserId: row.reviewedByUserId,
    requestedAt: row.requestedAt,
    approvedAt: row.approvedAt,
    settledAt: row.settledAt,
  });
}

@Injectable()
export class PrismaPayoutsRepository extends PayoutsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string, tx?: TxContext): Promise<Payout | null> {
    const row = await clientFrom(this.prisma, tx).payout.findUnique({ where: { id } });

    return row ? toDomain(row) : null;
  }

  async list(filter: PayoutListFilter, tx?: TxContext): Promise<Payout[]> {
    const rows = await clientFrom(this.prisma, tx).payout.findMany({
      where: {
        ...(filter.profileId ? { profileId: filter.profileId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: { requestedAt: 'desc' },
      take: filter.limit,
    });

    return rows.map(toDomain);
  }

  async create(payout: Payout, tx?: TxContext): Promise<void> {
    const props = payout.toProps();

    await clientFrom(this.prisma, tx).payout.create({
      data: {
        id: props.id,
        profileId: props.profileId,
        requestedByUserId: props.requestedByUserId,
        amountMinor: props.amount.amountMinor,
        feeMinor: props.fee.amountMinor,
        netMinor: props.net.amountMinor,
        currency: props.amount.currency,
        method: props.method,
        destination: props.destination,
        destinationMasked: props.destinationMasked,
        status: props.status,
        requestedAt: props.requestedAt,
      },
    });
  }

  async save(payout: Payout, tx?: TxContext): Promise<void> {
    const props = payout.toProps();

    // Valores, destino e requerente não entram: o que muda num levantamento é
    // o estado e quem o decidiu.
    await clientFrom(this.prisma, tx).payout.update({
      where: { id: props.id },
      data: {
        status: props.status,
        providerReference: props.providerReference,
        failureReason: props.failureReason,
        reviewedByUserId: props.reviewedByUserId,
        approvedAt: props.approvedAt,
        settledAt: props.settledAt,
      },
    });
  }

  async lockCreatorForUpdate(profileId: string, tx: TxContext): Promise<void> {
    // `FOR UPDATE` no perfil: o segundo pedido fica à espera do primeiro e só
    // lê o razão quando a reserva dele já lá está (RN-053).
    await clientFrom(this.prisma, tx).$queryRaw`
      SELECT id FROM profiles WHERE id = ${profileId}::uuid FOR UPDATE
    `;
  }
}
