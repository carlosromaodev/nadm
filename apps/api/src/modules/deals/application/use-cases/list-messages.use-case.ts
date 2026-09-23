import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '@/shared/application/transaction';
import type { Message } from '../../domain/message';
import { MessagesRepository } from '../ports/conversation.repository';
import { DealsRepository } from '../ports/deals.repository';
import { requireParticipant } from './deal-access';

export interface ListMessagesInput {
  actorUserId: string;
  dealId: string;
  limit?: number;
}

@Injectable()
export class ListMessagesUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly deals: DealsRepository,
    private readonly messages: MessagesRepository,
  ) {}

  async execute(input: ListMessagesInput): Promise<Message[]> {
    return this.transactions.run(async (tx) => {
      const found = await this.deals.findById(input.dealId, tx);
      const deal = requireParticipant(found, input.actorUserId, input.dealId);

      return this.messages.listByDeal(deal.id, input.limit ?? 100, tx);
    });
  }
}
