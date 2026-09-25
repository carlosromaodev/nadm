import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { Clock } from '@/core/clock/clock';
import { PrismaService } from '@/core/database/prisma.service';

const FREE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const messageInclude = {
  messages: { orderBy: { createdAt: 'asc' as const }, take: 200 },
  creatorProfile: { select: { id: true, handle: true, displayName: true, settings: true, userId: true } },
  buyer: { select: { id: true, displayName: true } },
};

@Injectable()
export class DirectMessagesService {
  constructor(private readonly prisma: PrismaService, private readonly clock: Clock) {}

  async forCreator(handle: string, userId: string) {
    const profile = await this.prisma.profile.findFirst({
      where: { handle: { equals: handle, mode: 'insensitive' }, publishedAt: { not: null } },
      select: { id: true, userId: true },
    });
    if (!profile) throw new NotFoundException('Criador não encontrado');
    if (profile.userId === userId) throw new ForbiddenException('Não podes iniciar uma DM contigo');

    const conversation = await this.prisma.directConversation.findUnique({
      where: { buyerUserId_creatorProfileId: { buyerUserId: userId, creatorProfileId: profile.id } },
      include: messageInclude,
    });
    return conversation ? this.present(conversation, userId) : {
      id: null,
      messages: [],
      canSendFree: true,
      nextFreeAt: null,
    };
  }

  async list(userId: string) {
    const conversations = await this.prisma.directConversation.findMany({
      where: { OR: [{ buyerUserId: userId }, { creatorProfile: { userId } }] },
      orderBy: { lastMessageAt: 'desc' },
      include: messageInclude,
    });
    return conversations.map((conversation) => this.present(conversation, userId));
  }

  async byId(id: string, userId: string) {
    const conversation = await this.prisma.directConversation.findUnique({
      where: { id }, include: messageInclude,
    });
    if (!conversation || (conversation.buyerUserId !== userId && conversation.creatorProfile.userId !== userId)) {
      throw new NotFoundException('Conversa não encontrada');
    }
    return this.present(conversation, userId);
  }

  async start(handle: string, userId: string, body: string, clientId: string) {
    const profile = await this.prisma.profile.findFirst({
      where: { handle: { equals: handle, mode: 'insensitive' }, publishedAt: { not: null } },
      select: { id: true, userId: true },
    });
    if (!profile) throw new NotFoundException('Criador não encontrado');
    if (profile.userId === userId) throw new ForbiddenException('Não podes iniciar uma DM contigo');

    const now = this.clock.now();
    const conversation = await this.prisma.$transaction(async (tx) => {
      // O par ainda não tem `conversationId` no primeiro envio. Este bloqueio
      // estável fecha a corrida antes do `upsert` e da restrição única.
      const pairKey = `direct:${userId}:${profile.id}`;
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${pairKey}, 0))`;
      const thread = await tx.directConversation.upsert({
        where: { buyerUserId_creatorProfileId: { buyerUserId: userId, creatorProfileId: profile.id } },
        create: { buyerUserId: userId, creatorProfileId: profile.id, lastMessageAt: now },
        update: {},
      });
      return this.createMessage(tx, thread.id, userId, profile.userId, body, clientId, now);
    });
    return this.byId(conversation.id, userId);
  }

  async reply(id: string, userId: string, body: string, clientId: string) {
    const current = await this.prisma.directConversation.findUnique({
      where: { id }, include: { creatorProfile: { select: { userId: true } } },
    });
    if (!current || (current.buyerUserId !== userId && current.creatorProfile.userId !== userId)) {
      throw new NotFoundException('Conversa não encontrada');
    }
    const now = this.clock.now();
    await this.prisma.$transaction((tx) => this.createMessage(
      tx, current.id, userId, current.creatorProfile.userId, body, clientId, now,
    ));
    return this.byId(id, userId);
  }

  private async createMessage(
    tx: Prisma.TransactionClient,
    conversationId: string,
    senderUserId: string,
    creatorUserId: string,
    body: string,
    clientId: string,
    now: Date,
  ) {
    // Seleccionar um inteiro evita o tipo PostgreSQL `void`, que o Prisma não
    // desserializa, sem abdicar do bloqueio transaccional da conversa.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${conversationId}, 0))`;
    const existing = await tx.directMessage.findUnique({
      where: { conversationId_clientId: { conversationId, clientId } },
    });
    if (existing) return { id: conversationId };

    if (senderUserId !== creatorUserId) {
      const latest = await tx.directMessage.findFirst({
        where: { conversationId, senderUserId }, orderBy: { createdAt: 'desc' },
      });
      if (latest && latest.createdAt.getTime() + FREE_INTERVAL_MS > now.getTime()) {
        throw new UnprocessableEntityException({
          message: 'Já enviaste a mensagem grátis desta semana',
          nextFreeAt: new Date(latest.createdAt.getTime() + FREE_INTERVAL_MS).toISOString(),
        });
      }
    }
    await tx.directMessage.create({ data: { conversationId, senderUserId, body, clientId, createdAt: now } });
    await tx.directConversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } });
    return { id: conversationId };
  }

  private present(conversation: Awaited<ReturnType<PrismaService['directConversation']['findUnique']>> & Record<string, unknown>, viewerId: string) {
    const value = conversation as unknown as {
      id: string; buyerUserId: string; lastMessageAt: Date;
      creatorProfile: { id: string; handle: string; displayName: string; settings: unknown; userId: string };
      buyer: { id: string; displayName: string };
      messages: Array<{ id: string; senderUserId: string; body: string; clientId: string; readAt: Date | null; createdAt: Date }>;
    };
    const latestBuyer = [...value.messages].reverse().find((message) => message.senderUserId === value.buyerUserId);
    const nextFreeAt = latestBuyer ? new Date(latestBuyer.createdAt.getTime() + FREE_INTERVAL_MS) : null;
    const settings = value.creatorProfile.settings as { avatarUrl?: string } | null;
    return {
      id: value.id,
      viewerRole: value.buyerUserId === viewerId ? 'buyer' : 'creator',
      creator: {
        id: value.creatorProfile.id,
        handle: value.creatorProfile.handle,
        displayName: value.creatorProfile.displayName,
        avatarUrl: settings?.avatarUrl ?? null,
      },
      buyer: value.buyer,
      lastMessageAt: value.lastMessageAt.toISOString(),
      canSendFree: value.creatorProfile.userId === viewerId || !nextFreeAt || nextFreeAt <= this.clock.now(),
      nextFreeAt: nextFreeAt?.toISOString() ?? null,
      messages: value.messages.map((message) => ({
        ...message,
        readAt: message.readAt?.toISOString() ?? null,
        createdAt: message.createdAt.toISOString(),
      })),
    };
  }
}
