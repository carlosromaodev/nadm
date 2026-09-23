import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { clientFrom } from '@/core/database/prisma-transaction';
import { PrismaService } from '@/core/database/prisma.service';
import { ResourceConflictError } from '@/core/errors/domain-error';
import type { TxContext } from '@/shared/application/transaction';
import { DevSessionRepository, type CreateDevIdentity } from '../../application/ports/dev-session.repository';

@Injectable()
export class PrismaDevSessionRepository extends DevSessionRepository {
  constructor(private readonly prisma: PrismaService) { super(); }

  async create(input: CreateDevIdentity, tx: TxContext): Promise<void> {
    try {
      await clientFrom(this.prisma, tx).user.create({ data: {
        id: input.userId, displayName: input.displayName, phone: input.phone,
        roles: input.role === 'CREATOR' ? ['FAN', 'CREATOR'] : ['FAN'],
        verificationLevel: 'NONE',
        accounts: { create: { id: input.accountId, type: 'INDIVIDUAL' } },
      } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ResourceConflictError('Este número já está em uso. Não foi iniciada sessão nessa conta.');
      }
      throw error;
    }
  }
}
