import {
  DealReferenceGenerator,
  DealsRepository,
  type DealListFilter,
} from '@/modules/deals/application/ports/deals.repository';
import {
  DeliveriesRepository,
  MessagesRepository,
  type CreateDeliveryInput,
  type CreateMessageInput,
} from '@/modules/deals/application/ports/conversation.repository';
import {
  CounterOffersRepository,
  type CreateCounterOfferInput,
} from '@/modules/deals/application/ports/counter-offers.repository';
import type { CounterOffer, CounterOfferStatus } from '@/modules/deals/domain/counter-offer';
import {
  DeliveriesLog,
  OutboxQueue,
  type PendingEvent,
  type RecordedDelivery,
} from '@/modules/notifications/application/ports/notifications.repository';
import { FindingsRepository } from '@/modules/ops/application/ports/reconciliation.repository';
import type {
  FindingStatus,
  ReconciliationFinding,
} from '@/modules/ops/domain/reconciliation';
import { DisputesRepository } from '@/modules/deals/application/ports/disputes.repository';
import { Dispute, DisputeAlreadyOpenError } from '@/modules/deals/domain/dispute';
import type { Deal } from '@/modules/deals/domain/deal';
import type { Delivery } from '@/modules/deals/domain/delivery';
import type { Message } from '@/modules/deals/domain/message';
import {
  AccountsRepository,
  UsersRepository,
} from '@/modules/identity/application/ports/identity.repository';
import { IdentityVerificationsRepository } from '@/modules/identity/application/ports/identity-verifications.repository';
import type {
  IdentityVerification,
  IdentityVerificationStatus,
} from '@/modules/identity/domain/identity-verification';
import type { Account, User } from '@/modules/identity/domain/user';
import {
  PayoutsRepository,
  type PayoutListFilter,
} from '@/modules/payouts/application/ports/payouts.repository';
import type { Payout } from '@/modules/payouts/domain/payout';
import {
  LedgerRepository,
  WalletsRepository,
  type LedgerEntryView,
  type WalletView,
} from '@/modules/ledger/application/ports/ledger.repository';
import type {
  LedgerAccount,
  LedgerTransaction,
} from '@/modules/ledger/domain/ledger-transaction';
import {
  PaymentEventsRepository,
  PaymentIntentsRepository,
  type CreatePaymentIntentInput,
  type RecordPaymentEventInput,
} from '@/modules/payments/application/ports/payments.repository';
import type { PaymentEvent, PaymentIntent } from '@/modules/payments/domain/payment-intent';
import {
  OffersRepository,
  ProfilesRepository,
  type CreateOfferInput,
  type CreateProfileInput,
  type UpdateProfileInput,
  type UpdateOfferInput,
} from '@/modules/profiles/application/ports/profiles.repository';
import {
  ContentRepository,
  MediaUrlSigner,
  PrivateMediaStorage,
  type MediaClaims,
} from '@/modules/content/application/ports/content.repository';
import type {
  ContentGrant,
  ContentItem,
  StoredMedia,
} from '@/modules/content/domain/content';
import { AvailabilityRepository } from '@/modules/profiles/application/ports/availability.repository';
import {
  OverlappingWindowError,
  type AvailabilityWindow,
} from '@/modules/profiles/domain/availability';
import type { Offer, Profile } from '@/modules/profiles/domain/profile';
import {
  AuditLogRepository,
  type AuditLogInput,
} from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import {
  OutboxRepository,
  type OutboxEventInput,
} from '@/shared/application/ports/outbox.repository';
import { TransactionRunner, type TxContext } from '@/shared/application/transaction';
import { Money } from '@/shared/domain/money';
import type { InMemoryDatabase } from './in-memory-database';

export class SequentialIdGenerator extends IdGenerator {
  private counter = 0;

  constructor(private readonly prefix = 'id') {
    super();
  }

  next(): string {
    this.counter += 1;
    return `${this.prefix}-${this.counter}`;
  }
}

/**
 * Executa o trabalho sem transacção real. É deliberado: rollback e atomicidade
 * são propriedades do Postgres e testam-se contra Postgres, não contra um Map
 * que finge sabê-las. Ver docs/plano.md §F1, verificação 1.
 */
export class PassthroughTransactionRunner extends TransactionRunner {
  run<T>(work: (tx: TxContext) => Promise<T>): Promise<T> {
    return work({});
  }
}

export class InMemoryUsersRepository extends UsersRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async findById(id: string): Promise<User | null> {
    return this.db.users.get(id) ?? null;
  }

  async findByPhone(phone: string): Promise<User | null> {
    return [...this.db.users.values()].find((user) => user.phone === phone) ?? null;
  }
  async suspend(userId: string, reason: string, at: Date): Promise<void> {
    const user = this.db.users.get(userId);
    if (user) {
      this.db.users.set(userId, {
        ...user,
        status: 'SUSPENDED',
        suspendedAt: at,
        suspensionReason: reason,
      });
    }
  }

  async reinstate(userId: string): Promise<void> {
    const user = this.db.users.get(userId);
    if (user) {
      this.db.users.set(userId, {
        ...user,
        status: 'ACTIVE',
        suspendedAt: null,
        suspensionReason: null,
      });
    }
  }

  async setVerificationLevel(
    userId: string,
    level: User['verificationLevel'],
  ): Promise<void> {
    const user = this.db.users.get(userId);
    if (user) this.db.users.set(userId, { ...user, verificationLevel: level });
  }
}

export class InMemoryAccountsRepository extends AccountsRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async findById(id: string): Promise<Account | null> {
    return this.db.accounts.get(id) ?? null;
  }

  async findIndividualByUser(userId: string): Promise<Account | null> {
    return (
      [...this.db.accounts.values()].find(
        (account) => account.ownerUserId === userId && account.type === 'INDIVIDUAL',
      ) ?? null
    );
  }
}

export class InMemoryProfilesRepository extends ProfilesRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async findById(id: string): Promise<Profile | null> {
    return this.db.profiles.get(id) ?? null;
  }

  async findByHandle(handle: string): Promise<Profile | null> {
    const normalized = handle.toLowerCase();
    return (
      [...this.db.profiles.values()].find(
        (profile) => profile.handle.toLowerCase() === normalized,
      ) ?? null
    );
  }

  async findByUserId(userId: string): Promise<Profile | null> {
    return [...this.db.profiles.values()].find((profile) => profile.userId === userId) ?? null;
  }

  async create(input: CreateProfileInput): Promise<Profile> {
    const profile: Profile = {
      id: input.id,
      userId: input.userId,
      handle: input.handle,
      displayName: input.displayName,
      bio: input.bio,
      availabilityStatus: 'AVAILABLE',
      publishedAt: input.publishedAt,
    };

    this.db.profiles.set(profile.id, profile);
    return profile;
  }

  async listPublished(query: string): Promise<Profile[]> {
    return [...this.db.profiles.values()].filter((profile) => profile.publishedAt !== null
      && profile.settings?.publicVisible !== false && profile.settings?.discoverable !== false
      && `${profile.handle} ${profile.displayName} ${profile.bio ?? ''}`.toLowerCase().includes(query.toLowerCase())).slice(0, 50);
  }

  async update(id: string, input: UpdateProfileInput): Promise<Profile> {
    const profile = { ...this.db.profiles.get(id)!, ...input };
    this.db.profiles.set(id, profile);
    return profile;
  }
}

export class InMemoryOffersRepository extends OffersRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async findById(id: string): Promise<Offer | null> {
    return this.db.offers.get(id) ?? null;
  }

  async listActiveByProfile(profileId: string): Promise<Offer[]> {
    return [...this.db.offers.values()].filter(
      (offer) => offer.profileId === profileId && offer.status === 'ACTIVE',
    );
  }

  async create(input: CreateOfferInput): Promise<Offer> {
    const offer: Offer = { ...input, status: 'ACTIVE' };
    this.db.offers.set(offer.id, offer);
    return offer;
  }

  async listByProfile(profileId: string): Promise<Offer[]> {
    return [...this.db.offers.values()].filter((offer) => offer.profileId === profileId && offer.status !== 'ARCHIVED');
  }

  async update(id: string, input: UpdateOfferInput): Promise<Offer> {
    const offer = { ...this.db.offers.get(id)!, ...input };
    this.db.offers.set(id, offer);
    return offer;
  }
  async findByContentItem(contentItemId: string): Promise<Offer | null> {
    return (
      [...this.db.offers.values()].find((offer) => offer.contentItemId === contentItemId) ?? null
    );
  }
}

export class InMemoryDealsRepository extends DealsRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async findById(id: string): Promise<Deal | null> {
    return this.db.deals.get(id) ?? null;
  }

  async findByReference(reference: string): Promise<Deal | null> {
    return [...this.db.deals.values()].find((deal) => deal.reference === reference) ?? null;
  }

  async listFor(filter: DealListFilter): Promise<Deal[]> {
    return [...this.db.deals.values()]
      .filter((deal) =>
        filter.role === 'buyer'
          ? deal.isBuyer(filter.userId)
          : deal.isCreator(filter.userId),
      )
      .filter((deal) => !filter.status || deal.status === filter.status)
      .slice(0, filter.limit);
  }

  async listExpiredProposals(now: Date, limit: number): Promise<Deal[]> {
    return [...this.db.deals.values()]
      .filter((deal) => deal.hasExpiredAt(now))
      .slice(0, limit);
  }

  async listPendingAutoApproval(deliveredBefore: Date, limit: number): Promise<Deal[]> {
    return [...this.db.deals.values()]
      .filter(
        (deal) =>
          deal.status === 'DELIVERED' &&
          deal.deliveredAt !== null &&
          deal.deliveredAt <= deliveredBefore,
      )
      .slice(0, limit);
  }

  async create(deal: Deal): Promise<void> {
    this.db.deals.set(deal.id, deal);
  }

  async save(deal: Deal): Promise<void> {
    this.db.deals.set(deal.id, deal);
  }

  async saveRenegotiated(deal: Deal): Promise<void> {
    this.db.deals.set(deal.id, deal);
  }
}

export class InMemoryCounterOffersRepository extends CounterOffersRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async findById(id: string): Promise<CounterOffer | null> {
    return this.db.counterOffers.find((offer) => offer.id === id) ?? null;
  }

  async findPending(dealId: string): Promise<CounterOffer | null> {
    return (
      this.db.counterOffers.find(
        (offer) => offer.dealId === dealId && offer.status === 'PENDING',
      ) ?? null
    );
  }

  async listByDeal(dealId: string): Promise<CounterOffer[]> {
    return this.db.counterOffers.filter((offer) => offer.dealId === dealId);
  }

  async create(input: CreateCounterOfferInput): Promise<CounterOffer> {
    const offer: CounterOffer = { ...input, status: 'PENDING', resolvedAt: null };
    this.db.counterOffers.push(offer);
    return offer;
  }

  async resolve(
    id: string,
    status: Exclude<CounterOfferStatus, 'PENDING'>,
    resolvedAt: Date,
  ): Promise<void> {
    const index = this.db.counterOffers.findIndex((offer) => offer.id === id);
    if (index >= 0) {
      this.db.counterOffers[index] = { ...this.db.counterOffers[index], status, resolvedAt };
    }
  }
}

export class InMemoryDealReferenceGenerator extends DealReferenceGenerator {
  private counter = 0;

  async next(): Promise<string> {
    this.counter += 1;
    return `NDM-2026-${this.counter.toString().padStart(7, '0')}`;
  }
}

export class InMemoryMessagesRepository extends MessagesRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async listByDeal(dealId: string, limit: number): Promise<Message[]> {
    return this.db.messages
      .filter((message) => message.dealId === dealId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, limit);
  }

  async findByClientId(dealId: string, clientId: string): Promise<Message | null> {
    return (
      this.db.messages.find(
        (message) => message.dealId === dealId && message.clientId === clientId,
      ) ?? null
    );
  }

  async create(input: CreateMessageInput): Promise<Message> {
    const message: Message = { ...input, readAt: null };
    this.db.messages.push(message);
    return message;
  }
}

export class InMemoryDeliveriesRepository extends DeliveriesRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async listByDeal(dealId: string): Promise<Delivery[]> {
    return this.db.deliveries
      .filter((delivery) => delivery.dealId === dealId)
      .sort((a, b) => a.version - b.version);
  }

  async findLatest(dealId: string): Promise<Delivery | null> {
    const all = await this.listByDeal(dealId);
    return all.at(-1) ?? null;
  }

  async create(input: CreateDeliveryInput): Promise<Delivery> {
    const delivery: Delivery = {
      ...input,
      acceptedAt: null,
      rejectedAt: null,
      rejectionReason: null,
    };

    this.db.deliveries.push(delivery);
    return delivery;
  }

  async markAccepted(id: string, acceptedAt: Date): Promise<void> {
    const index = this.db.deliveries.findIndex((delivery) => delivery.id === id);
    if (index >= 0) {
      this.db.deliveries[index] = { ...this.db.deliveries[index], acceptedAt };
    }
  }

  async markRejected(id: string, rejectedAt: Date, reason: string): Promise<void> {
    const index = this.db.deliveries.findIndex((delivery) => delivery.id === id);
    if (index >= 0) {
      this.db.deliveries[index] = {
        ...this.db.deliveries[index],
        rejectedAt,
        rejectionReason: reason,
      };
    }
  }
}

export class InMemoryPaymentIntentsRepository extends PaymentIntentsRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async findById(id: string): Promise<PaymentIntent | null> {
    return this.db.paymentIntents.get(id) ?? null;
  }

  async findByProviderReference(providerReference: string): Promise<PaymentIntent | null> {
    return (
      [...this.db.paymentIntents.values()].find(
        (intent) => intent.providerReference === providerReference,
      ) ?? null
    );
  }

  async findActiveByDeal(dealId: string): Promise<PaymentIntent | null> {
    return (
      [...this.db.paymentIntents.values()].find(
        (intent) =>
          intent.dealId === dealId &&
          (intent.status === 'CREATED' || intent.status === 'PENDING'),
      ) ?? null
    );
  }

  async create(input: CreatePaymentIntentInput): Promise<PaymentIntent> {
    // Espelha o índice único parcial de 004_payments: uma intenção activa por Deal.
    const active = await this.findActiveByDeal(input.dealId);
    if (active) {
      throw Object.assign(new Error('unique constraint: payment_intents_one_active_per_deal'), {
        code: 'P2002',
      });
    }

    const intent: PaymentIntent = { ...input, capturedAt: null };
    this.db.paymentIntents.set(intent.id, intent);
    return intent;
  }

  async markCaptured(id: string, capturedAt: Date): Promise<void> {
    const intent = this.db.paymentIntents.get(id);
    if (intent) {
      this.db.paymentIntents.set(id, { ...intent, status: 'CAPTURED', capturedAt });
    }
  }

  async expireActiveByDeal(dealId: string): Promise<void> {
    for (const [id, intent] of this.db.paymentIntents) {
      if (intent.dealId === dealId && (intent.status === 'CREATED' || intent.status === 'PENDING')) {
        this.db.paymentIntents.set(id, { ...intent, status: 'EXPIRED' });
      }
    }
  }
}

export class InMemoryPaymentEventsRepository extends PaymentEventsRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async findByProviderEventId(providerEventId: string): Promise<PaymentEvent | null> {
    return (
      [...this.db.paymentEvents.values()].find(
        (event) => event.providerEventId === providerEventId,
      ) ?? null
    );
  }

  async recordIfNew(input: RecordPaymentEventInput): Promise<PaymentEvent | null> {
    if (await this.findByProviderEventId(input.providerEventId)) {
      return null;
    }

    const event: PaymentEvent = {
      id: input.id,
      paymentIntentId: input.paymentIntentId,
      providerEventId: input.providerEventId,
      type: input.type,
      receivedAt: input.receivedAt,
      processedAt: null,
    };

    this.db.paymentEvents.set(event.id, event);
    return event;
  }

  async markProcessed(id: string, processedAt: Date): Promise<void> {
    const event = this.db.paymentEvents.get(id);
    if (event) {
      this.db.paymentEvents.set(id, { ...event, processedAt });
    }
  }
}

export class InMemoryLedgerRepository extends LedgerRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async record(transaction: LedgerTransaction): Promise<boolean> {
    if (await this.existsByExternalReference(transaction.kind, transaction.externalReference)) {
      return false;
    }

    this.db.ledger.push(transaction);
    return true;
  }

  async existsByExternalReference(kind: string, externalReference: string): Promise<boolean> {
    return this.db.ledger.some(
      (transaction) =>
        transaction.kind === kind && transaction.externalReference === externalReference,
    );
  }

  async balanceOf(account: LedgerAccount, subjectId: string): Promise<Money> {
    return this.db.ledger
      .flatMap((transaction) => transaction.entries)
      .filter((entry) => entry.account === account && entry.subjectId === subjectId)
      .reduce((sum, entry) => sum.add(entry.signedAmount), Money.zero());
  }

  async listBySubject(subjectId: string, limit: number): Promise<LedgerEntryView[]> {
    return this.db.ledger
      .flatMap((transaction) =>
        transaction.entries
          .filter((entry) => entry.subjectId === subjectId)
          .map((entry) => ({
            id: `${transaction.id}:${entry.account}`,
            transactionId: transaction.id,
            transactionKind: transaction.kind,
            description: transaction.description,
            account: entry.account,
            direction: entry.direction,
            amount: entry.amount,
            dealId: transaction.dealId,
            occurredAt: transaction.occurredAt,
          })),
      )
      .slice(0, limit);
  }
}

export class InMemoryWalletsRepository extends WalletsRepository {
  constructor(
    private readonly db: InMemoryDatabase,
    private readonly ledger: LedgerRepository,
  ) {
    super();
  }

  async findByProfile(profileId: string): Promise<WalletView | null> {
    if (!this.db.profiles.has(profileId)) return null;
    return this.recomputeFromLedger(profileId, new Date(0));
  }

  async recomputeFromLedger(profileId: string, recomputedAt: Date): Promise<WalletView> {
    // O saldo é sempre resultado dos movimentos, nunca um campo guardado (RN-103).
    return {
      profileId,
      available: await this.ledger.amountOwed('CREATOR_AVAILABLE', profileId),
      reserved: await this.ledger.amountOwed('CREATOR_RESERVED', profileId),
      pending: Money.zero(),
      recomputedAt,
    };
  }
}

export class InMemoryOutboxRepository extends OutboxRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async enqueue(event: OutboxEventInput): Promise<void> {
    this.db.outbox.push({
      ...event,
      id: `outbox-${this.db.outbox.length + 1}`,
      attempts: 0,
      processedAt: null,
      lastError: null,
    });
  }
}

export class InMemoryAuditLogRepository extends AuditLogRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async record(entry: AuditLogInput): Promise<void> {
    this.db.auditLog.push(entry);
  }
}

export class InMemoryIdentityVerificationsRepository extends IdentityVerificationsRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async findById(id: string): Promise<IdentityVerification | null> {
    return this.db.identityVerifications.find((v) => v.id === id) ?? null;
  }

  async findPendingByUser(userId: string): Promise<IdentityVerification | null> {
    return (
      this.db.identityVerifications.find(
        (v) => v.userId === userId && v.status === 'PENDING',
      ) ?? null
    );
  }

  async listByUser(userId: string): Promise<IdentityVerification[]> {
    return this.db.identityVerifications.filter((v) => v.userId === userId);
  }

  async listByStatus(
    status: IdentityVerificationStatus,
    limit: number,
  ): Promise<IdentityVerification[]> {
    return this.db.identityVerifications.filter((v) => v.status === status).slice(0, limit);
  }

  async create(verification: IdentityVerification): Promise<void> {
    this.db.identityVerifications.push(verification);
  }

  async save(verification: IdentityVerification): Promise<void> {
    const index = this.db.identityVerifications.findIndex((v) => v.id === verification.id);
    if (index >= 0) this.db.identityVerifications[index] = verification;
  }
}

export class InMemoryPayoutsRepository extends PayoutsRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async findById(id: string): Promise<Payout | null> {
    return this.db.payouts.get(id) ?? null;
  }

  async list(filter: PayoutListFilter): Promise<Payout[]> {
    return [...this.db.payouts.values()]
      .filter((p) => !filter.profileId || p.isOwnedBy(filter.profileId))
      .filter((p) => !filter.status || p.status === filter.status)
      .slice(0, filter.limit);
  }

  async create(payout: Payout): Promise<void> {
    this.db.payouts.set(payout.id, payout);
  }

  async save(payout: Payout): Promise<void> {
    this.db.payouts.set(payout.id, payout);
  }

  async lockCreatorForUpdate(): Promise<void> {
    // Um `Map` não serializa nada. O bloqueio de linha é propriedade do
    // Postgres e testa-se contra Postgres — ver o e2e de F5.
  }
}

export class InMemoryDisputesRepository extends DisputesRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async findById(id: string): Promise<Dispute | null> {
    return this.db.disputes.find((dispute) => dispute.id === id) ?? null;
  }

  async findOpenByDeal(dealId: string): Promise<Dispute | null> {
    return (
      this.db.disputes.find((dispute) => dispute.dealId === dealId && dispute.isOpen) ?? null
    );
  }

  async listByDeal(dealId: string): Promise<Dispute[]> {
    return this.db.disputes.filter((dispute) => dispute.dealId === dealId);
  }

  async listOpen(limit: number): Promise<Dispute[]> {
    return this.db.disputes.filter((dispute) => dispute.isOpen).slice(0, limit);
  }

  async create(dispute: Dispute): Promise<void> {
    // Espelha `disputes_one_open_idx`: uma só aberta por `Deal`.
    if (await this.findOpenByDeal(dispute.dealId)) {
      throw new DisputeAlreadyOpenError();
    }

    this.db.disputes.push(dispute);
  }

  async save(dispute: Dispute): Promise<void> {
    const index = this.db.disputes.findIndex((d) => d.id === dispute.id);
    if (index >= 0) this.db.disputes[index] = dispute;
  }
}

export class InMemoryAvailabilityRepository extends AvailabilityRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async findById(id: string): Promise<AvailabilityWindow | null> {
    return this.db.windows.get(id) ?? null;
  }

  async listUpcomingByOffer(offerId: string, now: Date): Promise<AvailabilityWindow[]> {
    return [...this.db.windows.values()]
      .filter((window) => window.offerId === offerId && window.endsAt > now)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }

  async listUpcomingByProfile(profileId: string, now: Date): Promise<AvailabilityWindow[]> {
    return [...this.db.windows.values()]
      .filter((window) => window.profileId === profileId && window.endsAt > now)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }

  async hasBookableSlots(profileId: string, now: Date): Promise<boolean | null> {
    const comMarcacao = [...this.db.offers.values()].some(
      (offer) => offer.profileId === profileId && offer.kind === 'BOOKING' && offer.status === 'ACTIVE',
    );

    if (!comMarcacao) return null;

    return (await this.listUpcomingByProfile(profileId, now)).some(
      (window) => window.slotsTaken < window.slotsTotal,
    );
  }

  async create(window: AvailabilityWindow): Promise<AvailabilityWindow> {
    // Espelha `availability_windows_no_overlap`, com o mesmo intervalo `[)`.
    const sobrepoe = [...this.db.windows.values()].some(
      (outra) =>
        outra.offerId === window.offerId &&
        outra.startsAt < window.endsAt &&
        window.startsAt < outra.endsAt,
    );

    if (sobrepoe) {
      throw new OverlappingWindowError();
    }

    this.db.windows.set(window.id, window);
    return window;
  }

  async takeSlot(id: string): Promise<boolean> {
    const window = this.db.windows.get(id);

    if (!window || window.slotsTaken >= window.slotsTotal) return false;

    this.db.windows.set(id, { ...window, slotsTaken: window.slotsTaken + 1 });
    return true;
  }

  async releaseSlot(id: string): Promise<void> {
    const window = this.db.windows.get(id);

    if (window && window.slotsTaken > 0) {
      this.db.windows.set(id, { ...window, slotsTaken: window.slotsTaken - 1 });
    }
  }

  async delete(id: string): Promise<void> {
    this.db.windows.delete(id);
  }
}

export class InMemoryFindingsRepository extends FindingsRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async findById(id: string): Promise<ReconciliationFinding | null> {
    return this.db.findings.find((finding) => finding.id === id) ?? null;
  }

  async list(filter: { status?: FindingStatus; limit: number }): Promise<ReconciliationFinding[]> {
    return this.db.findings
      .filter((finding) => !filter.status || finding.status === filter.status)
      .slice(0, filter.limit);
  }

  async countOpen(): Promise<number> {
    return this.db.findings.filter((finding) => finding.status === 'OPEN').length;
  }

  async recordIfNew(finding: ReconciliationFinding): Promise<boolean> {
    // Espelha `reconciliation_findings_one_open_idx`: uma aberta por impressão
    // digital, e a tarefa pode correr as vezes que quiser.
    const jaAberta = this.db.findings.some(
      (outra) => outra.status === 'OPEN' && outra.fingerprint === finding.fingerprint,
    );

    if (jaAberta) return false;

    this.db.findings.push(finding);
    return true;
  }

  async save(finding: ReconciliationFinding): Promise<void> {
    const index = this.db.findings.findIndex((outra) => outra.id === finding.id);
    if (index >= 0) this.db.findings[index] = finding;
  }
}

export class InMemoryOutboxQueue extends OutboxQueue {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async claimBatch(now: Date, limit: number): Promise<PendingEvent[]> {
    return this.db.outbox
      .filter((event) => event.processedAt === null && event.availableAt <= now)
      .slice(0, limit)
      .map((event) => ({
        id: event.id,
        type: event.type,
        payload: event.payload,
        attempts: event.attempts,
      }));
  }

  async markProcessed(id: string, processedAt: Date): Promise<void> {
    const event = this.db.outbox.find((outro) => outro.id === id);
    if (event) event.processedAt = processedAt;
  }

  async markFailed(id: string, error: string, retryAt: Date): Promise<void> {
    const event = this.db.outbox.find((outro) => outro.id === id);

    if (event) {
      event.attempts += 1;
      event.lastError = error;
      event.availableAt = retryAt;
    }
  }
}

export class InMemoryDeliveriesLog extends DeliveriesLog {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async recordIfNew(delivery: RecordedDelivery): Promise<boolean> {
    // Espelha a chave única de `notification_deliveries`: é aí que a
    // idempotência acontece, e não numa verificação antes.
    if (this.db.notifications.some((outra) => outra.idempotencyKey === delivery.idempotencyKey)) {
      return false;
    }

    this.db.notifications.push(delivery);
    return true;
  }

  async listForUser(userId: string, limit: number): Promise<RecordedDelivery[]> {
    return this.db.notifications
      .filter((delivery) => delivery.recipientUserId === userId)
      .slice(0, limit);
  }
}

export class InMemoryContentRepository extends ContentRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async createMedia(media: StoredMedia): Promise<void> {
    this.db.media.set(media.id, media);
  }

  async findMedia(id: string): Promise<StoredMedia | null> {
    return this.db.media.get(id) ?? null;
  }

  async findItem(id: string): Promise<ContentItem | null> {
    return this.db.contentItems.get(id) ?? null;
  }

  async listItems(profileId: string): Promise<ContentItem[]> {
    return [...this.db.contentItems.values()].filter(
      (item) => item.profileId === profileId && item.deletedAt === null,
    );
  }

  async saveItem(item: ContentItem): Promise<ContentItem> {
    this.db.contentItems.set(item.id, item);
    return item;
  }

  async findGrant(contentId: string, userId: string): Promise<ContentGrant | null> {
    return (
      this.db.contentGrants.find(
        (grant) => grant.contentId === contentId && grant.userId === userId,
      ) ?? null
    );
  }

  async createGrant(grant: ContentGrant): Promise<void> {
    // Espelha `UNIQUE(content_id, user_id)`: o mesmo direito não se dá duas vezes.
    if (await this.findGrant(grant.contentId, grant.userId)) return;

    this.db.contentGrants.push(grant);
  }
}

/** Armazenamento em memória. Nenhum teste escreve em disco. */
export class InMemoryMediaStorage extends PrivateMediaStorage {
  readonly files = new Map<string, Uint8Array>();

  async write(storageKey: string, bytes: Uint8Array): Promise<void> {
    this.files.set(storageKey, bytes);
  }

  async read(storageKey: string): Promise<Uint8Array> {
    const bytes = this.files.get(storageKey);

    if (!bytes) throw new Error(`Media ${storageKey} não existe`);

    return bytes;
  }

  async remove(storageKey: string): Promise<void> {
    this.files.delete(storageKey);
  }
}

/**
 * Assinador de teste, sem criptografia.
 *
 * Guarda as reivindicações num mapa e devolve uma referência. Não prova nada
 * sobre a assinatura — isso é do `LocalMediaUrlSigner` e testa-se contra ele —
 * mas deixa exercitar o que interessa aqui: quem tem direito a quê, e até quando.
 */
export class InMemoryMediaUrlSigner extends MediaUrlSigner {
  private readonly tokens = new Map<string, MediaClaims>();
  private counter = 0;

  async sign(claims: MediaClaims): Promise<string> {
    this.counter += 1;
    const token = `token-${this.counter}`;
    this.tokens.set(token, claims);

    return `/api/media/${claims.mediaId}?token=${token}`;
  }

  async verify(token: string): Promise<MediaClaims | null> {
    return this.tokens.get(token) ?? null;
  }

  /** O token dentro de uma URL assinada, para os testes o poderem usar. */
  tokenOf(url: string): string {
    return new URL(url, 'http://local').searchParams.get('token') ?? '';
  }
}
