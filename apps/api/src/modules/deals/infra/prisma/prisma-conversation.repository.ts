import { Injectable } from '@nestjs/common';
import { clientFrom } from '@/core/database/prisma-transaction';
import { PrismaService } from '@/core/database/prisma.service';
import type { TxContext } from '@/shared/application/transaction';
import type { Delivery } from '../../domain/delivery';
import type { Message, MessageKind } from '../../domain/message';
import {
  DeliveriesRepository,
  MessagesRepository,
  type CreateDeliveryInput,
  type CreateMessageInput,
} from '../../application/ports/conversation.repository';

interface MessageRow {
  id: string;
  dealId: string;
  senderUserId: string | null;
  kind: string;
  body: string;
  clientId: string | null;
  readAt: Date | null;
  createdAt: Date;
}

function toMessage(row: MessageRow): Message {
  return { ...row, kind: row.kind as MessageKind };
}

@Injectable()
export class PrismaMessagesRepository extends MessagesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listByDeal(dealId: string, limit: number, tx?: TxContext): Promise<Message[]> {
    const rows = await clientFrom(this.prisma, tx).message.findMany({
      where: { dealId },
      orderBy: [{ createdAt: 'asc' }, { seq: 'asc' }],
      take: limit,
    });

    return rows.map(toMessage);
  }

  async findByClientId(
    dealId: string,
    clientId: string,
    tx?: TxContext,
  ): Promise<Message | null> {
    const row = await clientFrom(this.prisma, tx).message.findUnique({
      where: { dealId_clientId: { dealId, clientId } },
    });

    return row ? toMessage(row) : null;
  }

  async create(input: CreateMessageInput, tx?: TxContext): Promise<Message> {
    const row = await clientFrom(this.prisma, tx).message.create({ data: input });

    return toMessage(row);
  }
}

@Injectable()
export class PrismaDeliveriesRepository extends DeliveriesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listByDeal(dealId: string, tx?: TxContext): Promise<Delivery[]> {
    return clientFrom(this.prisma, tx).delivery.findMany({
      where: { dealId },
      orderBy: { version: 'asc' },
    });
  }

  async findLatest(dealId: string, tx?: TxContext): Promise<Delivery | null> {
    return clientFrom(this.prisma, tx).delivery.findFirst({
      where: { dealId },
      orderBy: { version: 'desc' },
    });
  }

  async create(input: CreateDeliveryInput, tx?: TxContext): Promise<Delivery> {
    return clientFrom(this.prisma, tx).delivery.create({ data: input });
  }

  async markAccepted(id: string, acceptedAt: Date, tx?: TxContext): Promise<void> {
    await clientFrom(this.prisma, tx).delivery.update({ where: { id }, data: { acceptedAt } });
  }

  async markRejected(
    id: string,
    rejectedAt: Date,
    reason: string,
    tx?: TxContext,
  ): Promise<void> {
    await clientFrom(this.prisma, tx).delivery.update({
      where: { id },
      data: { rejectedAt, rejectionReason: reason },
    });
  }
}
