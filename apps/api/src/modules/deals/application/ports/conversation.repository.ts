import type { TxContext } from '@/shared/application/transaction';
import type { MessageKind } from '../../domain/message';
import type { Message } from '../../domain/message';
import type { Delivery } from '../../domain/delivery';

export interface CreateMessageInput {
  id: string;
  dealId: string;
  senderUserId: string | null;
  kind: MessageKind;
  body: string;
  clientId: string | null;
  createdAt: Date;
}

export abstract class MessagesRepository {
  abstract listByDeal(dealId: string, limit: number, tx?: TxContext): Promise<Message[]>;

  abstract findByClientId(
    dealId: string,
    clientId: string,
    tx?: TxContext,
  ): Promise<Message | null>;

  abstract create(input: CreateMessageInput, tx?: TxContext): Promise<Message>;
}

export interface CreateDeliveryInput {
  id: string;
  dealId: string;
  version: number;
  note: string;
  submittedAt: Date;
}

export abstract class DeliveriesRepository {
  abstract listByDeal(dealId: string, tx?: TxContext): Promise<Delivery[]>;

  abstract findLatest(dealId: string, tx?: TxContext): Promise<Delivery | null>;

  abstract create(input: CreateDeliveryInput, tx?: TxContext): Promise<Delivery>;

  abstract markAccepted(id: string, acceptedAt: Date, tx?: TxContext): Promise<void>;

  abstract markRejected(
    id: string,
    rejectedAt: Date,
    reason: string,
    tx?: TxContext,
  ): Promise<void>;
}
