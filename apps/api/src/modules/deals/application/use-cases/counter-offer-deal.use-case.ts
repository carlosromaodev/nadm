import { Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { ResourceConflictError } from '@/core/errors/domain-error';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { OutboxRepository } from '@/shared/application/ports/outbox.repository';
import { PricingPolicy } from '@/shared/application/ports/pricing-policy';
import { TransactionRunner } from '@/shared/application/transaction';
import { Money } from '@/shared/domain/money';
import type { CounterOffer } from '../../domain/counter-offer';
import type { Deal } from '../../domain/deal';
import { CounterOfferUnchangedError } from '../../domain/errors';
import { counterOfferBody } from '../../domain/message';
import { MessagesRepository } from '../ports/conversation.repository';
import { CounterOffersRepository } from '../ports/counter-offers.repository';
import { DealsRepository } from '../ports/deals.repository';
import { requireCreator, requireParticipant } from './deal-access';

export interface CounterOfferDealInput {
  actorUserId: string;
  dealId: string;
  /** O preço anunciado que o criador pede, em cêntimos, como string. */
  priceMinor: string;
  slaHours: number;
  message?: string | null;
}

/**
 * T4 — o criador responde com outro preço, outro prazo, ou ambos.
 *
 * **Nada de dinheiro se move aqui.** O escrow continua a valer o valor antigo,
 * e o acerto — reforço ou estorno parcial — só acontece se o comprador aceitar.
 * Contrapropor é abrir uma pergunta, não cobrar nada.
 *
 * O prazo troca de dono: passa a ser o comprador quem tem de responder, e é
 * contra ele que T13 corre a partir de agora.
 */
@Injectable()
export class CounterOfferDealUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly deals: DealsRepository,
    private readonly counterOffers: CounterOffersRepository,
    private readonly messages: MessagesRepository,
    private readonly outbox: OutboxRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly ids: IdGenerator,
    private readonly pricing: PricingPolicy,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: CounterOfferDealInput,
  ): Promise<{ deal: Deal; counterOffer: CounterOffer }> {
    const now = this.clock.now();

    return this.transactions.run(async (tx) => {
      const found = await this.deals.findById(input.dealId, tx);
      const deal = requireCreator(
        requireParticipant(found, input.actorUserId, input.dealId),
        input.actorUserId,
      );

      const price = Money.fromMinor(input.priceMinor, deal.amount.currency);

      // Contrapropor os mesmos termos é ruído na conversa e mais uma volta de
      // espera para o comprador sem nada para decidir.
      if (price.equals(deal.price) && input.slaHours === deal.offerSnapshot.slaHours) {
        throw new CounterOfferUnchangedError();
      }

      // A entidade decide primeiro: contrapor de novo sobre um pedido já em
      // contraproposta é um erro de estado, não um conflito de linhas.
      deal.counterOffer(now, this.pricing.proposalWindowHours());

      // A rede de segurança para o caso de sobrar uma contraproposta por
      // resolver. Quem o garante a sério é o índice único parcial da migração
      // 013 — uma verificação em aplicação perde a corrida.
      if (await this.counterOffers.findPending(deal.id, tx)) {
        throw new ResourceConflictError(
          'Já existe uma contraproposta à espera de resposta neste pedido.',
        );
      }

      const counterOffer = await this.counterOffers.create(
        {
          id: this.ids.next(),
          dealId: deal.id,
          proposedByUserId: input.actorUserId,
          price,
          slaHours: input.slaHours,
          message: input.message?.trim() || null,
          expiresAt: deal.expiresAt!,
          createdAt: now,
        },
        tx,
      );

      await this.deals.save(deal, tx);

      if (counterOffer.message) {
        await this.messages.create(
          {
            id: this.ids.next(),
            dealId: deal.id,
            senderUserId: input.actorUserId,
            kind: 'TEXT',
            body: counterOffer.message,
            clientId: null,
            createdAt: now,
          },
          tx,
        );
      }

      // A contraproposta fica escrita na conversa com os números lá dentro: é
      // ali que se lê a história da negociação, não numa tabela à parte.
      await this.messages.create(
        {
          id: this.ids.next(),
          dealId: deal.id,
          senderUserId: null,
          kind: 'STATE_CHANGE',
          body: counterOfferBody(price, input.slaHours),
          clientId: null,
          createdAt: now,
        },
        tx,
      );

      await this.outbox.enqueue(
        {
          type: 'deal.counter_offered',
          payload: {
            dealId: deal.id,
            counterOfferId: counterOffer.id,
            buyerUserId: deal.buyerUserId,
            priceMinor: price.amountMinor.toString(),
            slaHours: input.slaHours,
          },
          availableAt: now,
        },
        tx,
      );

      await this.auditLog.record(
        {
          actorUserId: input.actorUserId,
          actorKind: 'USER',
          action: 'deal.counter_offered',
          subjectType: 'Deal',
          subjectId: deal.id,
          metadata: {
            counterOfferId: counterOffer.id,
            priceMinor: price.amountMinor.toString(),
            slaHours: input.slaHours,
          },
        },
        tx,
      );

      return { deal, counterOffer };
    });
  }
}