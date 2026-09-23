import { Injectable } from '@nestjs/common';
import { clientFrom } from '@/core/database/prisma-transaction';
import { PrismaService } from '@/core/database/prisma.service';
import type { TxContext } from '@/shared/application/transaction';
import type { Account, AccountType, Role, User, UserStatus, VerificationLevel } from '../../domain/user';
import {
  AccountsRepository,
  UsersRepository,
} from '../../application/ports/identity.repository';

interface UserRow {
  id: string;
  phone: string;
  email: string | null;
  displayName: string;
  roles: string[];
  status: string;
  verificationLevel: string;
}

function toUser(row: UserRow): User {
  return {
    ...row,
    roles: row.roles as Role[],
    status: row.status as UserStatus,
    verificationLevel: row.verificationLevel as VerificationLevel,
  };
}

interface AccountRow {
  id: string;
  type: string;
  legalName: string | null;
  taxId: string | null;
  ownerUserId: string;
}

function toAccount(row: AccountRow): Account {
  return { ...row, type: row.type as AccountType };
}

@Injectable()
export class PrismaUsersRepository extends UsersRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string, tx?: TxContext): Promise<User | null> {
    const row = await clientFrom(this.prisma, tx).user.findUnique({ where: { id } });
    return row ? toUser(row) : null;
  }

  async findByPhone(phone: string, tx?: TxContext): Promise<User | null> {
    const row = await clientFrom(this.prisma, tx).user.findUnique({ where: { phone } });
    return row ? toUser(row) : null;
  }

  async suspend(userId: string, reason: string, at: Date, tx?: TxContext): Promise<void> {
    await clientFrom(this.prisma, tx).user.update({
      where: { id: userId },
      data: { status: 'SUSPENDED', suspendedAt: at, suspensionReason: reason },
    });
  }

  async reinstate(userId: string, tx?: TxContext): Promise<void> {
    // As colunas voltam a `null` porque o `CHECK` da migração 019 não admite
    // uma conta activa com motivo de suspensão pendurado.
    await clientFrom(this.prisma, tx).user.update({
      where: { id: userId },
      data: { status: 'ACTIVE', suspendedAt: null, suspensionReason: null },
    });
  }

  async setVerificationLevel(
    userId: string,
    level: User['verificationLevel'],
    tx?: TxContext,
  ): Promise<void> {
    await clientFrom(this.prisma, tx).user.update({
      where: { id: userId },
      data: { verificationLevel: level },
    });
  }
}

@Injectable()
export class PrismaAccountsRepository extends AccountsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string, tx?: TxContext): Promise<Account | null> {
    const row = await clientFrom(this.prisma, tx).account.findUnique({ where: { id } });
    return row ? toAccount(row) : null;
  }

  async findIndividualByUser(userId: string, tx?: TxContext): Promise<Account | null> {
    const row = await clientFrom(this.prisma, tx).account.findFirst({
      where: { ownerUserId: userId, type: 'INDIVIDUAL' },
    });

    return row ? toAccount(row) : null;
  }
}
