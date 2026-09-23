import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { clientFrom } from '@/core/database/prisma-transaction';
import { PrismaService } from '@/core/database/prisma.service';
import {
  AuditLogRepository,
  type AuditLogInput,
} from '../application/ports/audit-log.repository';
import {
  OutboxRepository,
  type OutboxEventInput,
} from '../application/ports/outbox.repository';
import type { TxContext } from '../application/transaction';

@Injectable()
export class PrismaOutboxRepository extends OutboxRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async enqueue(event: OutboxEventInput, tx?: TxContext): Promise<void> {
    await clientFrom(this.prisma, tx).outboxEvent.create({
      data: {
        type: event.type,
        payload: event.payload as Prisma.InputJsonValue,
        availableAt: event.availableAt,
      },
    });
  }
}

@Injectable()
export class PrismaAuditLogRepository extends AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async record(entry: AuditLogInput, tx?: TxContext): Promise<void> {
    await clientFrom(this.prisma, tx).auditLog.create({
      data: {
        actorUserId: entry.actorUserId,
        actorKind: entry.actorKind,
        action: entry.action,
        subjectType: entry.subjectType,
        subjectId: entry.subjectId,
        metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: entry.ip ?? null,
      },
    });
  }
}
