import type { MoneyValue } from './money';

// Relative URLs work on localhost and on the project's ngrok tunnel alike.
const BASE = '/api';

export type DealStatus =
  | 'PROPOSED'
  | 'COUNTER_OFFERED'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'DELIVERED'
  | 'APPROVED'
  | 'PAID'
  | 'DECLINED'
  | 'REFUNDED'
  | 'EXPIRED';

export type EscrowStatus = 'PENDING' | 'HELD' | 'RELEASED' | 'REFUNDED' | 'FAILED';

export interface Deal {
  id: string;
  reference: string;
  status: DealStatus;
  escrowStatus: EscrowStatus;
  /** O preço anunciado da oferta, sem taxa. */
  price: MoneyValue;
  /** A metade da taxa que o comprador paga por cima do preço. */
  buyerFee: MoneyValue;
  /** O que o comprador paga ao todo: `price + buyerFee`. */
  amount: MoneyValue;
  /** As duas metades somadas — o que fica para a NaDM. */
  platformFee: MoneyValue;
  /** A metade descontada ao criador. */
  creatorFee: MoneyValue;
  /** O que o criador recebe: `price − creatorFee`. */
  creatorNet: MoneyValue;
  offer: { id: string; title: string; kind: string; slaHours: number; revisionsIncluded: number };
  /** Alterações já pedidas pelo comprador, e quantas ainda restam (RN-044). */
  revisionCount: number;
  revisionsRemaining: number;
  brief: string | null;
  dueAt: string | null;
  /**
   * Quando o comprador ganha o direito a pedir devolução por atraso (T16).
   * `null` quando não há prazo por cumprir. A regra é do servidor.
   */
  refundableFrom?: string | null;
  expiresAt: string | null;
  createdAt: string;
  lastMessageAt: string | null;
  acceptedAt?: string | null;
  deliveredAt?: string | null;
  approvedAt?: string | null;
  settledAt?: string | null;
  /** Quando o negócio fechou, por qualquer das saídas terminais. */
  closedAt?: string | null;
}

export interface Message {
  id: string;
  kind: 'TEXT' | 'SYSTEM' | 'ATTACHMENT' | 'STATE_CHANGE';
  senderUserId: string | null;
  body: string;
  clientId: string | null;
  createdAt: string;
}

export interface Delivery {
  id: string;
  version: number;
  note: string;
  submittedAt: string;
  acceptedAt: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
}

export interface DealDetail extends Deal {
  viewerRole: 'buyer' | 'creator';
  /** A disputa aberta, se houver. É ela que decide o que o ecrã pode oferecer. */
  dispute?: Dispute | null;
  messages: Message[];
  deliveries: Delivery[];
}

export interface Offer {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  price: MoneyValue;
  slaHours: number;
  revisionsIncluded: number;
  requiresBrief: boolean;
}

export interface PublicProfile {
  id: string;
  handle: string;
  displayName: string;
  bio: string | null;
  avatarUrl?: string | null;
  availabilityStatus: 'AVAILABLE' | 'NO_SLOTS' | 'PAUSED';
  offers: Offer[];
}

export interface WalletEntry {
  id: string;
  description: string;
  kind: string;
  account: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: MoneyValue;
  dealId: string | null;
  occurredAt: string;
}

export interface Wallet {
  available: MoneyValue;
  reserved: MoneyValue;
  pending: MoneyValue;
  recomputedAt: string;
  entries: WalletEntry[];
}

export interface ValidationIssue {
  path: string;
  message: string;
}

/** Erro da API já traduzido — o que o servidor decidiu, não o que o cliente supõe. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: ValidationIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Enquanto DP-01 não fechar, é assim que o servidor sabe quem está a pedir. */
  actorUserId?: string | null;
  idempotencyKey?: string;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  if (options.actorUserId) headers['X-Dev-User'] = options.actorUserId;
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  });

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as
    | { message?: string; issues?: ValidationIssue[] }
    | null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.message ?? `Pedido falhou com ${response.status}`,
      payload?.issues ?? [],
    );
  }

  return payload as T;
}


// ─────────────────────────────────────────────── F5 · identidade e levantamentos

export type PayoutStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'PROCESSING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED';

export interface Payout {
  id: string;
  status: PayoutStatus;
  amount: MoneyValue;
  fee: MoneyValue;
  net: MoneyValue;
  method: 'BANK_TRANSFER' | 'MULTICAIXA_EXPRESS';
  /** Já mascarado pelo servidor. O destino completo nunca chega aqui. */
  destination: string;
  failureReason: string | null;
  requestedAt: string;
  approvedAt: string | null;
  settledAt: string | null;
}

export type IdentityVerificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface IdentityVerification {
  id: string;
  documentType: 'BI' | 'PASSPORT' | 'NIF';
  /** Já mascarado pelo servidor. */
  documentNumber: string;
  fullName: string;
  status: IdentityVerificationStatus;
  rejectionReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
}


// ─────────────────────────────────────────────────────────── F6 · disputas

export type DisputeStatus = 'OPEN' | 'RESOLVED' | 'WITHDRAWN';

export interface Dispute {
  id: string;
  status: DisputeStatus;
  resolution: 'BUYER' | 'CREATOR' | null;
  reason: string;
  decisionNote: string | null;
  openedByUserId: string;
  openedAt: string;
  decidedAt: string | null;
}

export interface Review {
  id: string;
  rating: number;
  body: string;
  /** A resposta do criador. Uma só, e não se apaga. */
  reply: string | null;
  repliedAt: string | null;
  publishedAt: string;
}

/** A média de um perfil, em décimas e em inteiros: 47 é 4,7. */
export interface ProfileRating {
  averageTenths: number;
  count: number;
}


// ────────────────────────────────────── F7 · disponibilidade e marcações

export interface AvailabilityWindow {
  id: string;
  offerId: string;
  startsAt: string;
  endsAt: string;
  slotsTotal: number;
  /** Quantas ainda sobram. É esta que decide se a vaga se pode escolher. */
  slotsFree: number;
  timezone?: string;
}


// ─────────────────────────────────────────────── F10 · operação

export type FindingSeverity = 'WARNING' | 'CRITICAL';
export type FindingStatus = 'OPEN' | 'RESOLVED' | 'ACCEPTED';

export interface ReconciliationFinding {
  id: string;
  kind: string;
  severity: FindingSeverity;
  status: FindingStatus;
  subjectType: string;
  subjectId: string;
  detail: string;
  metadata: Record<string, string>;
  detectedAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export interface PlatformMetrics {
  negocio: {
    dealsCriados: number;
    dealsAceites: number;
    dealsConcluidos: number;
    dealsDisputados: number;
  };
  /** Cêntimos em string, nunca número JSON (RN-111). */
  dinheiro: { retidoMinor: string; libertadoMinor: string; devolvidoMinor: string };
  integridade: {
    divergenciasAbertas: number;
    eventosPorProcessar: number;
    intencoesPresas: number;
  };
  filas: {
    disputasAbertas: number;
    levantamentosPorDecidir: number;
    identidadesPorDecidir: number;
  };
}

export interface AuditEntry {
  id: string;
  actorUserId: string | null;
  actorKind: string;
  action: string;
  subjectType: string;
  subjectId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/** O nome legível de cada tipo de divergência. */
export const NOME_DA_DIVERGENCIA: Record<string, string> = {
  STUCK_PAYMENT_INTENT: 'Pagamento preso',
  CAPTURE_WITHOUT_LEDGER: 'Captura sem lançamento',
  WALLET_DIVERGENCE: 'Carteira não bate com o razão',
  STUCK_PAYOUT: 'Levantamento preso',
  UNBALANCED_LEDGER: 'Razão desequilibrado',
  ESCROW_ON_CLOSED_DEAL: 'Escrow em pedido fechado',
};
