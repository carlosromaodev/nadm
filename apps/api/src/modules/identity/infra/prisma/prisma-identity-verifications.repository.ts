import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { clientFrom } from '@/core/database/prisma-transaction';
import { PrismaService } from '@/core/database/prisma.service';
import type { TxContext } from '@/shared/application/transaction';
import {
  IdentityVerification,
  type IdentityDocumentType,
  type IdentityVerificationStatus,
} from '../../domain/identity-verification';
import { IdentityVerificationsRepository } from '../../application/ports/identity-verifications.repository';

type Row = Prisma.IdentityVerificationGetPayload<object>;

function toDomain(row: Row): IdentityVerification {
  return IdentityVerification.reconstitute({
    id: row.id,
    userId: row.userId,
    documentType: row.documentType as IdentityDocumentType,
    documentNumber: row.documentNumber,
    fullName: row.fullName,
    status: row.status as IdentityVerificationStatus,
    reviewerUserId: row.reviewerUserId,
    reviewedAt: row.reviewedAt,
    rejectionReason: row.rejectionReason,
    submittedAt: row.submittedAt,
  });
}

@Injectable()
export class PrismaIdentityVerificationsRepository extends IdentityVerificationsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string, tx?: TxContext): Promise<IdentityVerification | null> {
    const row = await clientFrom(this.prisma, tx).identityVerification.findUnique({
      where: { id },
    });

    return row ? toDomain(row) : null;
  }

  async findPendingByUser(
    userId: string,
    tx?: TxContext,
  ): Promise<IdentityVerification | null> {
    const row = await clientFrom(this.prisma, tx).identityVerification.findFirst({
      where: { userId, status: 'PENDING' },
    });

    return row ? toDomain(row) : null;
  }

  async listByUser(userId: string, tx?: TxContext): Promise<IdentityVerification[]> {
    const rows = await clientFrom(this.prisma, tx).identityVerification.findMany({
      where: { userId },
      orderBy: { submittedAt: 'desc' },
    });

    return rows.map(toDomain);
  }

  async listByStatus(
    status: IdentityVerificationStatus,
    limit: number,
    tx?: TxContext,
  ): Promise<IdentityVerification[]> {
    const rows = await clientFrom(this.prisma, tx).identityVerification.findMany({
      where: { status },
      orderBy: { submittedAt: 'asc' },
      take: limit,
    });

    return rows.map(toDomain);
  }

  async create(verification: IdentityVerification, tx?: TxContext): Promise<void> {
    const props = verification.toProps();

    await clientFrom(this.prisma, tx).identityVerification.create({
      data: {
        id: props.id,
        userId: props.userId,
        documentType: props.documentType,
        documentNumber: props.documentNumber,
        fullName: props.fullName,
        status: props.status,
        submittedAt: props.submittedAt,
      },
    });
  }

  async save(verification: IdentityVerification, tx?: TxContext): Promise<void> {
    const props = verification.toProps();

    await clientFrom(this.prisma, tx).identityVerification.update({
      where: { id: props.id },
      data: {
        status: props.status,
        reviewerUserId: props.reviewerUserId,
        reviewedAt: props.reviewedAt,
        rejectionReason: props.rejectionReason,
      },
    });
  }
}
