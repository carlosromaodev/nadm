import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { clientFrom } from '@/core/database/prisma-transaction';
import { PrismaService } from '@/core/database/prisma.service';
import type { TxContext } from '@/shared/application/transaction';
import { Money } from '@/shared/domain/money';
import type { LedgerAccount, LedgerTransaction } from '../../domain/ledger-transaction';
import {
  LedgerRepository,
  WalletsRepository,
  type LedgerEntryView,
  type WalletView,
} from '../../application/ports/ledger.repository';

@Injectable()
export class PrismaLedgerRepository extends LedgerRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async record(transaction: LedgerTransaction, tx?: TxContext): Promise<boolean> {
    try {
      await clientFrom(this.prisma, tx).ledgerTransaction.create({
        data: {
          id: transaction.id,
          kind: transaction.kind,
          externalReference: transaction.externalReference,
          dealId: transaction.dealId,
          description: transaction.description,
          occurredAt: transaction.occurredAt,
          entries: {
            create: transaction.entries.map((entry) => ({
              account: entry.account,
              subjectType: entry.subjectType,
              subjectId: entry.subjectId,
              direction: entry.direction,
              amountMinor: entry.amount.amountMinor,
              currency: entry.amount.currency,
            })),
          },
        },
      });

      return true;
    } catch (error) {
      // `UNIQUE(kind, external_reference)`: a operação já tinha sido lançada.
      // Não duplicar é exactamente o que RN-104 exige.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }

      throw error;
    }
  }

  async existsByExternalReference(
    kind: string,
    externalReference: string,
    tx?: TxContext,
  ): Promise<boolean> {
    const found = await clientFrom(this.prisma, tx).ledgerTransaction.findUnique({
      where: { kind_externalReference: { kind, externalReference } },
      select: { id: true },
    });

    return found !== null;
  }

  /** Saldo a partir dos movimentos: créditos menos débitos. Ver RN-103. */
  async balanceOf(
    account: LedgerAccount,
    subjectId: string,
    tx?: TxContext,
  ): Promise<Money> {
    const grupos = await clientFrom(this.prisma, tx).ledgerEntry.groupBy({
      by: ['direction'],
      where: { account, subjectId },
      _sum: { amountMinor: true },
    });

    const porDireccao = new Map(
      grupos.map((grupo) => [grupo.direction, grupo._sum.amountMinor ?? 0n]),
    );

    const credito = porDireccao.get('CREDIT') ?? 0n;
    const debito = porDireccao.get('DEBIT') ?? 0n;

    // Débitos menos créditos, como `LedgerEntry.signedAmount`. Numa conta de
    // passivo isto é negativo quando há dívida — quem quer a dívida com sinal
    // positivo chama `amountOwed`.
    return Money.fromMinor(debito - credito);
  }

  async listBySubject(
    subjectId: string,
    limit: number,
    tx?: TxContext,
  ): Promise<LedgerEntryView[]> {
    const rows = await clientFrom(this.prisma, tx).ledgerEntry.findMany({
      where: { subjectId },
      include: { transaction: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });

    return rows.map((row) => ({
      id: row.id,
      transactionId: row.transactionId,
      transactionKind: row.transaction.kind,
      description: row.transaction.description,
      account: row.account as LedgerAccount,
      direction: row.direction,
      amount: Money.fromMinor(row.amountMinor, row.currency.trim() as 'AOA'),
      dealId: row.transaction.dealId,
      occurredAt: row.transaction.occurredAt,
    }));
  }
}

@Injectable()
export class PrismaWalletsRepository extends WalletsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerRepository,
  ) {
    super();
  }

  async findByProfile(profileId: string, tx?: TxContext): Promise<WalletView | null> {
    const row = await clientFrom(this.prisma, tx).wallet.findUnique({ where: { profileId } });

    if (!row) return null;

    return {
      profileId: row.profileId,
      available: Money.fromMinor(row.availableMinor, row.currency.trim() as 'AOA'),
      reserved: Money.fromMinor(row.reservedMinor, row.currency.trim() as 'AOA'),
      pending: Money.fromMinor(row.pendingMinor, row.currency.trim() as 'AOA'),
      recomputedAt: row.recomputedAt,
    };
  }

  /**
   * Recalcula a projecção a partir do razão e grava-a. O valor devolvido vem
   * sempre do cálculo, nunca da linha guardada — se a projecção divergir, é ela
   * que está errada (RN-103).
   */
  async recomputeFromLedger(
    profileId: string,
    recomputedAt: Date,
    tx?: TxContext,
  ): Promise<WalletView> {
    // A carteira mostra o que é **devido** ao criador, por isso lê a dívida e
    // não o saldo algébrico (RN-103).
    const available = await this.ledger.amountOwed('CREATOR_AVAILABLE', profileId, tx);
    const reserved = await this.ledger.amountOwed('CREATOR_RESERVED', profileId, tx);
    const pending = Money.zero();

    await clientFrom(this.prisma, tx).wallet.upsert({
      where: { profileId },
      create: {
        profileId,
        availableMinor: available.amountMinor,
        reservedMinor: reserved.amountMinor,
        pendingMinor: pending.amountMinor,
        currency: available.currency,
        recomputedAt,
      },
      update: {
        availableMinor: available.amountMinor,
        reservedMinor: reserved.amountMinor,
        pendingMinor: pending.amountMinor,
        recomputedAt,
      },
    });

    return { profileId, available, reserved, pending, recomputedAt };
  }
}
