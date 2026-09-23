import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '@/shared/application/transaction';
import type { CounterOffer } from '../../domain/counter-offer';
import type { Deal } from '../../domain/deal';
import type { Dispute } from '../../domain/dispute';
import type { Delivery } from '../../domain/delivery';
import type { Message } from '../../domain/message';
import type { DealStatus } from '../../domain/deal-status';
import {
  DeliveriesRepository,
  MessagesRepository,
} from '../ports/conversation.repository';
import { CounterOffersRepository } from '../ports/counter-offers.repository';
import { DisputesRepository } from '../ports/disputes.repository';
import { DealsRepository } from '../ports/deals.repository';
import { requireParticipant } from './deal-access';

export interface GetDealInput {
  actorUserId: string;
  dealId: string;
  messageLimit?: number;
}

export interface DealDetail {
  deal: Deal;
  messages: Message[];
  deliveries: Delivery[];
  /** Toda a negociação, por ordem. Vazia na esmagadora maioria dos pedidos. */
  counterOffers: CounterOffer[];
  /**
   * A disputa aberta, se houver.
   *
   * Vai no detalhe porque é o que decide o que o ecrã pode oferecer: quem a
   * abriu pode retirá-la, e quem não a abriu não.
   */
  dispute: Dispute | null;
  viewerRole: 'buyer' | 'creator';
}

@Injectable()
export class GetDealUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly deals: DealsRepository,
    private readonly messages: MessagesRepository,
    private readonly deliveries: DeliveriesRepository,
    private readonly counterOffers: CounterOffersRepository,
    private readonly disputes: DisputesRepository,
  ) {}

  async execute(input: GetDealInput): Promise<DealDetail> {
    return this.transactions.run(async (tx) => {
      const found = await this.deals.findById(input.dealId, tx);
      const deal = requireParticipant(found, input.actorUserId, input.dealId);

      return {
        deal,
        messages: await this.messages.listByDeal(deal.id, input.messageLimit ?? 100, tx),
        deliveries: await this.deliveries.listByDeal(deal.id, tx),
        counterOffers: await this.counterOffers.listByDeal(deal.id, tx),
        dispute: await this.disputes.findOpenByDeal(deal.id, tx),
        viewerRole: deal.isBuyer(input.actorUserId) ? 'buyer' : 'creator',
      };
    });
  }
}

export interface ListDealsInput {
  actorUserId: string;
  role: 'buyer' | 'creator';
  status?: DealStatus;
  limit?: number;
}

@Injectable()
export class ListDealsUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly deals: DealsRepository,
  ) {}

  async execute(input: ListDealsInput): Promise<Deal[]> {
    return this.transactions.run((tx) =>
      this.deals.listFor(
        {
          userId: input.actorUserId,
          role: input.role,
          status: input.status,
          limit: input.limit ?? 50,
        },
        tx,
      ),
    );
  }
}
