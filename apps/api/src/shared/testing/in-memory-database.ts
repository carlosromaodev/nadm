import type { Deal } from '@/modules/deals/domain/deal';
import type { Delivery } from '@/modules/deals/domain/delivery';
import type { Message } from '@/modules/deals/domain/message';
import type { Account, User } from '@/modules/identity/domain/user';
import type { LedgerTransaction } from '@/modules/ledger/domain/ledger-transaction';
import type { PaymentEvent, PaymentIntent } from '@/modules/payments/domain/payment-intent';
import type { AvailabilityWindow } from '@/modules/profiles/domain/availability';
import type {
  ContentGrant,
  ContentItem,
  StoredMedia,
} from '@/modules/content/domain/content';
import type { Offer, Profile } from '@/modules/profiles/domain/profile';
import type { CounterOffer } from '@/modules/deals/domain/counter-offer';
import type { Dispute } from '@/modules/deals/domain/dispute';
import type { ReconciliationFinding } from '@/modules/ops/domain/reconciliation';
import type { IdentityVerification } from '@/modules/identity/domain/identity-verification';
import type { Payout } from '@/modules/payouts/domain/payout';
import type { AuditLogInput } from '@/shared/application/ports/audit-log.repository';
import type { OutboxEventInput } from '@/shared/application/ports/outbox.repository';
import type { RecordedDelivery } from '@/modules/notifications/application/ports/notifications.repository';

/**
 * Estado partilhado pelos duplos em memória. Um único objecto para que os
 * repositórios falsos se vejam uns aos outros, tal como os reais partilham a
 * mesma base de dados.
 */
export class InMemoryDatabase {
  readonly users = new Map<string, User>();
  readonly accounts = new Map<string, Account>();
  readonly profiles = new Map<string, Profile>();
  readonly offers = new Map<string, Offer>();
  readonly windows = new Map<string, AvailabilityWindow>();
  readonly media = new Map<string, StoredMedia>();
  readonly contentItems = new Map<string, ContentItem>();
  readonly contentGrants: ContentGrant[] = [];
  readonly deals = new Map<string, Deal>();
  readonly messages: Message[] = [];
  readonly deliveries: Delivery[] = [];
  readonly paymentIntents = new Map<string, PaymentIntent>();
  readonly paymentEvents = new Map<string, PaymentEvent>();
  readonly ledger: LedgerTransaction[] = [];
  /**
   * A fila, com o identificador e o estado que a tabela real tem — é o que o
   * trabalhador precisa para marcar um evento como tratado.
   */
  readonly outbox: Array<
    OutboxEventInput & { id: string; attempts: number; processedAt: Date | null; lastError: string | null }
  > = [];
  readonly notifications: RecordedDelivery[] = [];
  readonly counterOffers: CounterOffer[] = [];
  readonly disputes: Dispute[] = [];
  readonly findings: ReconciliationFinding[] = [];
  readonly identityVerifications: IdentityVerification[] = [];
  readonly payouts = new Map<string, Payout>();
  readonly auditLog: AuditLogInput[] = [];

  clear(): void {
    this.users.clear();
    this.accounts.clear();
    this.profiles.clear();
    this.offers.clear();
    this.windows.clear();
    this.media.clear();
    this.contentItems.clear();
    this.contentGrants.length = 0;
    this.deals.clear();
    this.messages.length = 0;
    this.deliveries.length = 0;
    this.paymentIntents.clear();
    this.paymentEvents.clear();
    this.ledger.length = 0;
    this.outbox.length = 0;
    this.notifications.length = 0;
    this.counterOffers.length = 0;
    this.disputes.length = 0;
    this.findings.length = 0;
    this.identityVerifications.length = 0;
    this.payouts.clear();
    this.auditLog.length = 0;
  }
}
