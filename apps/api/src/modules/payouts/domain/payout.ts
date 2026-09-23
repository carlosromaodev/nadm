import { BusinessRuleError, ForbiddenActionError } from '@/core/errors/domain-error';
import { Money } from '@/shared/domain/money';

export const PAYOUT_STATUSES = [
  'REQUESTED',
  'APPROVED',
  'PROCESSING',
  'PAID',
  'FAILED',
  'CANCELLED',
] as const;

export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export type PayoutMethod = 'BANK_TRANSFER' | 'MULTICAIXA_EXPRESS';

/**
 * O caminho do dinheiro para fora da plataforma.
 *
 *   REQUESTED ──aprovação da admin──► APPROVED ──ordem enviada──► PROCESSING
 *       │                                 │                           │
 *       │                                 └───────────┬───────────────┘
 *       │                                             │
 *       ▼                                    ┌────────┴────────┐
 *   CANCELLED                                ▼                 ▼
 *   (o criador desiste)                    PAID             FAILED
 *
 * `CANCELLED`, `PAID` e `FAILED` são terminais. Em `CANCELLED` e `FAILED` o
 * valor reservado volta a disponível por estorno — nunca por alteração das
 * entradas que o reservaram (RN-101).
 */
export const PAYOUT_TRANSITIONS: Readonly<Record<PayoutStatus, readonly PayoutStatus[]>> = {
  REQUESTED: ['APPROVED', 'CANCELLED', 'FAILED'],
  APPROVED: ['PROCESSING', 'FAILED'],
  PROCESSING: ['PAID', 'FAILED'],
  PAID: [],
  FAILED: [],
  CANCELLED: [],
};

/** Os estados em que o valor está reservado e ainda pode voltar a disponível. */
export const PAYOUT_RESERVED_STATUSES: readonly PayoutStatus[] = [
  'REQUESTED',
  'APPROVED',
  'PROCESSING',
];

export class InvalidPayoutTransitionError extends BusinessRuleError {
  constructor(from: PayoutStatus, to: PayoutStatus) {
    super(`Payout cannot move from ${from} to ${to}`);
  }
}

/**
 * RN-051 — sem identidade verificada não sai dinheiro.
 *
 * **403 e não 404**, ao contrário dos guardas de relação: a carteira é dele, e
 * o que falta é a condição. Esconder isso atrás de um 404 diria à pessoa que a
 * sua própria carteira não existe.
 */
export class IdentityNotVerifiedError extends ForbiddenActionError {
  constructor() {
    super('Withdrawing requires a verified identity');
  }
}

/** RN-050 — o saldo é lido do razão, nunca da projecção. */
export class InsufficientBalanceError extends BusinessRuleError {
  constructor(requested: Money, available: Money) {
    super(`Requested ${requested.toString()} but only ${available.toString()} is available`);
  }
}

/** RN-054 — o mínimo é da plataforma e validado no servidor. */
export class BelowMinimumPayoutError extends BusinessRuleError {
  constructor(minimum: Money) {
    super(`The minimum withdrawal is ${minimum.toString()}`);
  }
}

export interface PayoutProps {
  id: string;
  profileId: string;
  requestedByUserId: string;
  amount: Money;
  fee: Money;
  net: Money;
  method: PayoutMethod;
  destination: string;
  destinationMasked: string;
  status: PayoutStatus;
  providerReference: string | null;
  failureReason: string | null;
  reviewedByUserId: string | null;
  requestedAt: Date;
  approvedAt: Date | null;
  settledAt: Date | null;
}

export interface RequestPayoutInput {
  id: string;
  profileId: string;
  requestedByUserId: string;
  amount: Money;
  fee: Money;
  method: PayoutMethod;
  destination: string;
  now: Date;
}

/**
 * Mostra só o suficiente para o criador reconhecer a conta que escolheu.
 *
 * O destino completo nunca sai da API nem entra no registo estruturado — é
 * dado que identifica uma pessoa e uma conta bancária.
 */
export function maskDestination(destination: string): string {
  const limpo = destination.replace(/\s+/g, '');
  const ultimos = limpo.slice(-4);

  return `••••${ultimos}`;
}

export class Payout {
  private constructor(private readonly props: PayoutProps) {}

  static request(input: RequestPayoutInput): Payout {
    if (!input.amount.isPositive) {
      throw new BusinessRuleError('A withdrawal must be for a positive amount');
    }

    const net = input.amount.subtract(input.fee);

    if (!net.isPositive) {
      throw new BusinessRuleError('The fee cannot swallow the whole withdrawal');
    }

    return new Payout({
      id: input.id,
      profileId: input.profileId,
      requestedByUserId: input.requestedByUserId,
      amount: input.amount,
      fee: input.fee,
      net,
      method: input.method,
      destination: input.destination.trim(),
      destinationMasked: maskDestination(input.destination),
      status: 'REQUESTED',
      providerReference: null,
      failureReason: null,
      reviewedByUserId: null,
      requestedAt: input.now,
      approvedAt: null,
      settledAt: null,
    });
  }

  static reconstitute(props: PayoutProps): Payout {
    return new Payout(props);
  }

  /** A administração aprova e o levantamento passa a poder ser enviado. */
  approve(reviewerUserId: string, now: Date): void {
    this.assertTransition('APPROVED');

    this.props.status = 'APPROVED';
    this.props.reviewedByUserId = reviewerUserId;
    this.props.approvedAt = now;
  }

  /** A ordem seguiu para o parceiro. Daqui já não se cancela. */
  markProcessing(providerReference: string): void {
    this.assertTransition('PROCESSING');

    this.props.status = 'PROCESSING';
    this.props.providerReference = providerReference;
  }

  /** O dinheiro chegou ao destino. O estorno deixa de ser possível. */
  markPaid(now: Date): void {
    this.assertTransition('PAID');

    this.props.status = 'PAID';
    this.props.settledAt = now;
  }

  /** Falhou no parceiro. O valor reservado volta a disponível, por estorno. */
  markFailed(reason: string, now: Date): void {
    this.assertTransition('FAILED');

    this.props.status = 'FAILED';
    this.props.failureReason = reason.trim() || null;
    this.props.settledAt = now;
  }

  /** O criador desiste, antes de a administração decidir. */
  cancel(now: Date): void {
    this.assertTransition('CANCELLED');

    this.props.status = 'CANCELLED';
    this.props.settledAt = now;
  }

  get id(): string {
    return this.props.id;
  }

  get profileId(): string {
    return this.props.profileId;
  }

  get status(): PayoutStatus {
    return this.props.status;
  }

  get amount(): Money {
    return this.props.amount;
  }

  get fee(): Money {
    return this.props.fee;
  }

  get net(): Money {
    return this.props.net;
  }

  /** Verdadeiro enquanto o valor está fora de disponível e pode voltar. */
  get holdsReservation(): boolean {
    return PAYOUT_RESERVED_STATUSES.includes(this.props.status);
  }

  isOwnedBy(profileId: string): boolean {
    return this.props.profileId === profileId;
  }

  toProps(): PayoutProps {
    return { ...this.props };
  }

  private assertTransition(to: PayoutStatus): void {
    if (!PAYOUT_TRANSITIONS[this.props.status].includes(to)) {
      throw new InvalidPayoutTransitionError(this.props.status, to);
    }
  }
}
