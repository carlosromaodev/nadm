import { FixedClock } from '@/core/clock/clock';
import type { Account, User } from '@/modules/identity/domain/user';
import { FakePaymentsGateway } from '@/modules/payments/infra/fake-payments.gateway';
import type { Offer, Profile } from '@/modules/profiles/domain/profile';
import { PricingPolicy } from '@/shared/application/ports/pricing-policy';
import { InMemoryDatabase } from './in-memory-database';
import {
  InMemoryAccountsRepository,
  InMemoryAvailabilityRepository,
  InMemoryContentRepository,
  InMemoryMediaStorage,
  InMemoryMediaUrlSigner,
  InMemoryAuditLogRepository,
  InMemoryDealReferenceGenerator,
  InMemoryCounterOffersRepository,
  InMemoryDealsRepository,
  InMemoryDisputesRepository,
  InMemoryFindingsRepository,
  InMemoryIdentityVerificationsRepository,
  InMemoryDeliveriesRepository,
  InMemoryLedgerRepository,
  InMemoryMessagesRepository,
  InMemoryOffersRepository,
  InMemoryDeliveriesLog,
  InMemoryOutboxQueue,
  InMemoryOutboxRepository,
  InMemoryPayoutsRepository,
  InMemoryPaymentEventsRepository,
  InMemoryPaymentIntentsRepository,
  InMemoryProfilesRepository,
  InMemoryUsersRepository,
  InMemoryWalletsRepository,
  PassthroughTransactionRunner,
  SequentialIdGenerator,
} from './in-memory-repositories';

export class FixedPricingPolicy extends PricingPolicy {
  constructor(
    /** 500 = 5% de cada lado, como o design. Ver DP-07. */
    private readonly feeBp = 500,
    private readonly windowHours = 48,
    private readonly approvalHours = 72,
    private readonly graceHours = 48,
    private readonly minimumPayout = 500_000n,
  ) {
    super();
  }

  platformFeeBasisPoints(): number {
    return this.feeBp;
  }

  proposalWindowHours(): number {
    return this.windowHours;
  }

  approvalWindowHours(): number {
    return this.approvalHours;
  }

  lateDeliveryGraceHours(): number {
    return this.graceHours;
  }

  minimumPayoutMinor(): bigint {
    return this.minimumPayout;
  }
}

export interface SeedUserInput {
  id: string;
  phone?: string;
  displayName?: string;
}

export interface SeedCreatorInput extends SeedUserInput {
  profileId?: string;
  handle?: string;
  availabilityStatus?: Profile['availabilityStatus'];
  published?: boolean;
}

export interface SeedOfferInput {
  id?: string;
  profileId: string;
  priceMinor?: bigint;
  kind?: Offer['kind'];
  slaHours?: number;
  revisionsIncluded?: number;
  requiresBrief?: boolean;
  status?: Offer['status'];
}

/** Tudo o que um teste de caso de uso precisa, sem rede e sem base de dados. */
export function makeTestContext(
  options: {
    feeBp?: number;
    proposalWindowHours?: number;
    approvalWindowHours?: number;
    lateDeliveryGraceHours?: number;
    minimumPayoutMinor?: bigint;
  } = {},
) {
  const db = new InMemoryDatabase();
  const clock = new FixedClock();
  const ids = new SequentialIdGenerator();
  const transactions = new PassthroughTransactionRunner();
  const pricing = new FixedPricingPolicy(
    options.feeBp ?? 500,
    options.proposalWindowHours ?? 48,
    options.approvalWindowHours ?? 72,
    options.lateDeliveryGraceHours ?? 48,
    options.minimumPayoutMinor ?? 500_000n,
  );

  const ledger = new InMemoryLedgerRepository(db);

  const repos = {
    users: new InMemoryUsersRepository(db),
    accounts: new InMemoryAccountsRepository(db),
    profiles: new InMemoryProfilesRepository(db),
    offers: new InMemoryOffersRepository(db),
    availability: new InMemoryAvailabilityRepository(db),
    contents: new InMemoryContentRepository(db),
    mediaStorage: new InMemoryMediaStorage(),
    mediaSigner: new InMemoryMediaUrlSigner(),
    deals: new InMemoryDealsRepository(db),
    counterOffers: new InMemoryCounterOffersRepository(db),
    disputes: new InMemoryDisputesRepository(db),
    findings: new InMemoryFindingsRepository(db),
    references: new InMemoryDealReferenceGenerator(),
    messages: new InMemoryMessagesRepository(db),
    deliveries: new InMemoryDeliveriesRepository(db),
    paymentIntents: new InMemoryPaymentIntentsRepository(db),
    paymentEvents: new InMemoryPaymentEventsRepository(db),
    ledger,
    wallets: new InMemoryWalletsRepository(db, ledger),
    identityVerifications: new InMemoryIdentityVerificationsRepository(db),
    payouts: new InMemoryPayoutsRepository(db),
    outbox: new InMemoryOutboxRepository(db),
    outboxQueue: new InMemoryOutboxQueue(db),
    notifications: new InMemoryDeliveriesLog(db),
    auditLog: new InMemoryAuditLogRepository(db),
  };

  const payments = new FakePaymentsGateway(clock);

  function seedUser(input: SeedUserInput): { user: User; account: Account } {
    const user: User = {
      id: input.id,
      phone: input.phone ?? `+2449${input.id.replace(/\D/g, '').padStart(8, '0')}`,
      email: null,
      displayName: input.displayName ?? input.id,
      roles: ['FAN'],
      status: 'ACTIVE',
      verificationLevel: 'PHONE',
    };

    const account: Account = {
      id: `account-${input.id}`,
      type: 'INDIVIDUAL',
      legalName: null,
      taxId: null,
      ownerUserId: user.id,
    };

    db.users.set(user.id, user);
    db.accounts.set(account.id, account);

    return { user, account };
  }

  function seedCreator(input: SeedCreatorInput): { user: User; profile: Profile } {
    const { user } = seedUser(input);

    const profile: Profile = {
      id: input.profileId ?? `profile-${input.id}`,
      userId: user.id,
      handle: input.handle ?? input.id.replace(/[^a-z0-9_]/g, '_'),
      displayName: user.displayName,
      bio: null,
      availabilityStatus: input.availabilityStatus ?? 'AVAILABLE',
      publishedAt: input.published === false ? null : new Date('2026-01-01T00:00:00.000Z'),
    };

    db.profiles.set(profile.id, profile);

    return { user, profile };
  }

  function seedOffer(input: SeedOfferInput): Offer {
    const offer: Offer = {
      id: input.id ?? `offer-${db.offers.size + 1}`,
      profileId: input.profileId,
      kind: input.kind ?? 'CUSTOM_SERVICE',
      title: 'Vídeo personalizado',
      description: null,
      priceMinor: input.priceMinor ?? 5_000_000n,
      currency: 'AOA',
      slaHours: input.slaHours ?? 48,
      revisionsIncluded: input.revisionsIncluded ?? 1,
      requiresBrief: input.requiresBrief ?? true,
      status: input.status ?? 'ACTIVE',
    };

    db.offers.set(offer.id, offer);

    return offer;
  }

  return { db, clock, ids, transactions, pricing, payments, seedUser, seedCreator, seedOffer, ...repos };
}

export type TestContext = ReturnType<typeof makeTestContext>;
