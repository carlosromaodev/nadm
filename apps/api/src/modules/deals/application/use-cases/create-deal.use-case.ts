import { Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { BusinessRuleError, ResourceNotFoundError } from '@/core/errors/domain-error';
import { AccountsRepository } from '@/modules/identity/application/ports/identity.repository';
import { AvailabilityRepository } from '@/modules/profiles/application/ports/availability.repository';
import {
  OffersRepository,
  ProfilesRepository,
} from '@/modules/profiles/application/ports/profiles.repository';
import {
  isBookableAt,
  NoSlotsAvailableError,
} from '@/modules/profiles/domain/availability';
import { acceptsNewDeals, snapshotOf } from '@/modules/profiles/domain/profile';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { OutboxRepository } from '@/shared/application/ports/outbox.repository';
import { PricingPolicy } from '@/shared/application/ports/pricing-policy';
import { TransactionRunner, type TxContext } from '@/shared/application/transaction';
import { Deal } from '../../domain/deal';
import { OfferNotAvailableError } from '../../domain/errors';
import { STATE_CHANGE_BODY } from '../../domain/message';
import { MessagesRepository } from '../ports/conversation.repository';
import { DealReferenceGenerator, DealsRepository } from '../ports/deals.repository';

export interface CreateDealInput {
  actorUserId: string;
  offerId: string;
  brief: string | null;
  /** Conta contratante. Em falta, usa-se a conta individual do comprador. */
  accountId?: string;
  /** Obrigatória nas ofertas `BOOKING`: é a vaga que se está a tomar. */
  availabilityWindowId?: string;
}

/**
 * T1 — o comprador propõe.
 *
 * É aqui que se cumpre a promessa do produto: o pedido não é uma linha numa
 * tabela à parte, é a abertura de um `Deal` que já traz a conversa dentro.
 */
@Injectable()
export class CreateDealUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly deals: DealsRepository,
    private readonly references: DealReferenceGenerator,
    private readonly offers: OffersRepository,
    private readonly profiles: ProfilesRepository,
    private readonly availability: AvailabilityRepository,
    private readonly accounts: AccountsRepository,
    private readonly messages: MessagesRepository,
    private readonly outbox: OutboxRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly ids: IdGenerator,
    private readonly pricing: PricingPolicy,
    private readonly clock: Clock,
  ) {}

  async execute(input: CreateDealInput): Promise<Deal> {
    const now = this.clock.now();

    return this.transactions.run(async (tx) => {
      const offer = await this.offers.findById(input.offerId, tx);

      if (!offer) {
        throw new ResourceNotFoundError('Offer', input.offerId);
      }

      const profile = await this.profiles.findById(offer.profileId, tx);

      if (!profile) {
        throw new ResourceNotFoundError('Profile', offer.profileId);
      }

      if (!acceptsNewDeals(profile)) {
        throw new OfferNotAvailableError(profile.availabilityStatus);
      }

      const account = input.accountId
        ? await this.accounts.findById(input.accountId, tx)
        : await this.accounts.findIndividualByUser(input.actorUserId, tx);

      if (!account || account.ownerUserId !== input.actorUserId) {
        throw new ResourceNotFoundError('Account', input.accountId ?? input.actorUserId);
      }

      // RN-034 — a vaga é tomada **na mesma transacção** que cria o `Deal`.
      // Reservar antes e criar depois deixaria vagas perdidas sempre que a
      // criação falhasse; reservar depois deixaria dois `Deal` para uma vaga.
      const windowId = await this.reserveSlot(offer, input.availabilityWindowId, now, tx);

      const deal = Deal.open({
        id: this.ids.next(),
        windowId,
        reference: await this.references.next(tx),
        buyerUserId: input.actorUserId,
        buyerAccountId: account.id,
        creatorProfileId: profile.id,
        creatorUserId: profile.userId,
        offerSnapshot: snapshotOf(offer, now),
        platformFeeBasisPoints: this.pricing.platformFeeBasisPoints(),
        brief: input.brief,
        proposalWindowHours: this.pricing.proposalWindowHours(),
        now,
      });

      await this.deals.create(deal, tx);

      // O brief fica na conversa, não só na coluna: é o primeiro que se lê ao
      // abrir o pedido, e é o que torna a conversa auto-explicativa.
      if (input.brief?.trim()) {
        await this.messages.create(
          {
            id: this.ids.next(),
            dealId: deal.id,
            senderUserId: input.actorUserId,
            kind: 'TEXT',
            body: input.brief.trim(),
            clientId: null,
            createdAt: now,
          },
          tx,
        );
      }

      await this.messages.create(
        {
          id: this.ids.next(),
          dealId: deal.id,
          senderUserId: null,
          kind: 'STATE_CHANGE',
          body: STATE_CHANGE_BODY.PROPOSED,
          clientId: null,
          createdAt: now,
        },
        tx,
      );

      await this.outbox.enqueue(
        {
          type: 'deal.created',
          payload: { dealId: deal.id, reference: deal.reference },
          availableAt: now,
        },
        tx,
      );

      await this.auditLog.record(
        {
          actorUserId: input.actorUserId,
          actorKind: 'USER',
          action: 'deal.created',
          subjectType: 'Deal',
          subjectId: deal.id,
          metadata: { offerId: offer.id, amountMinor: deal.amount.amountMinor.toString() },
        },
        tx,
      );

      return deal;
    });
  }

  /**
   * Toma a vaga de uma oferta de marcação, se for o caso.
   *
   * Devolve `null` para as ofertas que não são `BOOKING` — aí não há vaga
   * nenhuma para tomar, e exigir uma janela seria inventar trabalho.
   */
  private async reserveSlot(
    offer: { id: string; kind: string },
    windowId: string | undefined,
    now: Date,
    tx: TxContext,
  ): Promise<string | null> {
    if (offer.kind !== 'BOOKING') return null;

    if (!windowId) {
      throw new BusinessRuleError('Esta oferta exige escolher uma vaga.');
    }

    const window = await this.availability.findById(windowId, tx);

    // Uma janela de outra oferta não existe para este pedido.
    if (!window || window.offerId !== offer.id) {
      throw new ResourceNotFoundError('AvailabilityWindow', windowId);
    }

    if (!isBookableAt(window, now)) {
      throw new NoSlotsAvailableError();
    }

    // O `UPDATE` condicionado é que decide: entre dois compradores pela última
    // vaga, um incrementa e o outro não afecta linha nenhuma.
    if (!(await this.availability.takeSlot(window.id, tx))) {
      throw new NoSlotsAvailableError();
    }

    return window.id;
  }
}
