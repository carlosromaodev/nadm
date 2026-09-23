import { Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { OutboxRepository } from '@/shared/application/ports/outbox.repository';
import { TransactionRunner } from '@/shared/application/transaction';
import type { Message } from '../../domain/message';
import { MessagesRepository } from '../ports/conversation.repository';
import { DealsRepository } from '../ports/deals.repository';
import { requireParticipant } from './deal-access';

export interface SendMessageInput {
  actorUserId: string;
  dealId: string;
  body: string;
  /** Chave de idempotência do lado do cliente, para o duplo envio em rede fraca. */
  clientId: string | null;
}

@Injectable()
export class SendMessageUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly deals: DealsRepository,
    private readonly messages: MessagesRepository,
    private readonly outbox: OutboxRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: SendMessageInput): Promise<Message> {
    const now = this.clock.now();

    return this.transactions.run(async (tx) => {
      const found = await this.deals.findById(input.dealId, tx);
      const deal = requireParticipant(found, input.actorUserId, input.dealId);

      deal.assertAcceptsMessagesAt(now);

      if (input.clientId) {
        const existing = await this.messages.findByClientId(deal.id, input.clientId, tx);

        if (existing) {
          return existing;
        }
      }

      const message = await this.messages.create(
        {
          id: this.ids.next(),
          dealId: deal.id,
          senderUserId: input.actorUserId,
          kind: 'TEXT',
          body: input.body.trim(),
          clientId: input.clientId,
          createdAt: now,
        },
        tx,
      );

      deal.touchConversation(now);
      await this.deals.save(deal, tx);

      await this.outbox.enqueue(
        {
          type: 'message.created',
          payload: {
            dealId: deal.id,
            messageId: message.id,
            recipientUserId: deal.isBuyer(input.actorUserId)
              ? deal.creatorUserId
              : deal.buyerUserId,
          },
          availableAt: now,
        },
        tx,
      );

      return message;
    });
  }
}
