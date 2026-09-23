import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { clientFrom } from '@/core/database/prisma-transaction';
import { PrismaService } from '@/core/database/prisma.service';
import type { TxContext } from '@/shared/application/transaction';
import {
  DeliveriesLog,
  OutboxQueue,
  type PendingEvent,
  type RecordedDelivery,
} from '../../application/ports/notifications.repository';
import type { ChannelKind } from '../../domain/notification';

@Injectable()
export class PrismaOutboxQueue extends OutboxQueue {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async claimBatch(now: Date, limit: number, tx?: TxContext): Promise<PendingEvent[]> {
    const rows = await clientFrom(this.prisma, tx).outboxEvent.findMany({
      where: { processedAt: null, availableAt: { lte: now } },
      orderBy: { availableAt: 'asc' },
      take: limit,
    });

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      attempts: row.attempts,
    }));
  }

  async markProcessed(id: string, processedAt: Date, tx?: TxContext): Promise<void> {
    await clientFrom(this.prisma, tx).outboxEvent.update({
      where: { id },
      data: { processedAt },
    });
  }

  async markFailed(id: string, error: string, retryAt: Date, tx?: TxContext): Promise<void> {
    await clientFrom(this.prisma, tx).outboxEvent.update({
      where: { id },
      data: {
        attempts: { increment: 1 },
        lastError: error.slice(0, 2000),
        availableAt: retryAt,
      },
    });
  }
}

@Injectable()
export class PrismaDeliveriesLog extends DeliveriesLog {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async recordIfNew(delivery: RecordedDelivery, tx?: TxContext): Promise<boolean> {
    try {
      await clientFrom(this.prisma, tx).notificationDelivery.create({
        data: {
          id: delivery.id,
          outboxEventId: delivery.outboxEventId,
          recipientUserId: delivery.recipientUserId,
          channel: delivery.channel,
          template: delivery.template,
          idempotencyKey: delivery.idempotencyKey,
          provider: delivery.provider,
          providerReference: delivery.providerReference,
          sentAt: delivery.sentAt,
        },
      });

      return true;
    } catch (error) {
      // A chave única é a idempotência: já foi enviada, não se envia outra vez.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }

      throw error;
    }
  }

  async listForUser(
    userId: string,
    limit: number,
    tx?: TxContext,
  ): Promise<RecordedDelivery[]> {
    const rows = await clientFrom(this.prisma, tx).notificationDelivery.findMany({
      where: { recipientUserId: userId },
      orderBy: { sentAt: 'desc' },
      take: limit,
    });

    return rows.map((row) => ({
      id: row.id,
      outboxEventId: row.outboxEventId,
      recipientUserId: row.recipientUserId,
      channel: row.channel as ChannelKind,
      template: row.template,
      idempotencyKey: row.idempotencyKey,
      provider: row.provider,
      providerReference: row.providerReference,
      sentAt: row.sentAt,
    }));
  }
}
