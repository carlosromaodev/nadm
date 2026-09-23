import { BusinessRuleError, ResourceConflictError } from '@/core/errors/domain-error';

export const DISPUTE_STATUSES = ['OPEN', 'RESOLVED', 'WITHDRAWN'] as const;

export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

/** A favor de quem a administração decidiu. */
export type DisputeResolution = 'BUYER' | 'CREATOR';

export class DisputeAlreadyOpenError extends ResourceConflictError {
  constructor() {
    super('This deal already has an open dispute');
  }
}

export class NoOpenDisputeError extends ResourceConflictError {
  constructor() {
    super('This deal has no open dispute');
  }
}

/** RN-048 — com disputa aberta, o dinheiro não se move até alguém decidir. */
export class DisputeBlocksReleaseError extends BusinessRuleError {
  constructor() {
    super('An open dispute blocks the escrow release until it is decided');
  }
}

export class DisputeNotOpenError extends BusinessRuleError {
  constructor(status: DisputeStatus) {
    super(`A dispute in ${status} can no longer be decided`);
  }
}

export class DisputeReasonRequiredError extends BusinessRuleError {
  constructor() {
    super('Opening a dispute requires a reason');
  }
}

/**
 * O estado em que o `Deal` pode ser disputado.
 *
 * Antes de haver trabalho a correr não há nada para disputar, e depois de
 * `PAID` o dinheiro já saiu do escrow — a janela de contestação depois da
 * aprovação é DP-05, e nesta fatia `APPROVED` continua definitivo.
 */
export const DISPUTABLE_DEAL_STATUSES = ['ACCEPTED', 'IN_PROGRESS', 'DELIVERED'] as const;

export interface DisputeProps {
  id: string;
  dealId: string;
  openedByUserId: string;
  reason: string;
  status: DisputeStatus;
  resolution: DisputeResolution | null;
  decidedByUserId: string | null;
  decisionNote: string | null;
  openedAt: Date;
  decidedAt: Date | null;
}

/**
 * A saída quando as partes discordam.
 *
 *   OPEN ──decisão da administração──► RESOLVED  (a favor do comprador
 *     │                                           ou do criador)
 *     └──as partes entendem-se────────► WITHDRAWN
 *
 * Enquanto está aberta, a libertação do escrow fica travada (RN-048): é isso
 * que impede que o dinheiro siga para o criador enquanto a questão está por
 * resolver.
 */
export class Dispute {
  private constructor(private readonly props: DisputeProps) {}

  static open(input: {
    id: string;
    dealId: string;
    openedByUserId: string;
    reason: string;
    now: Date;
  }): Dispute {
    if (!input.reason.trim()) {
      throw new DisputeReasonRequiredError();
    }

    return new Dispute({
      id: input.id,
      dealId: input.dealId,
      openedByUserId: input.openedByUserId,
      reason: input.reason.trim(),
      status: 'OPEN',
      resolution: null,
      decidedByUserId: null,
      decisionNote: null,
      openedAt: input.now,
      decidedAt: null,
    });
  }

  static reconstitute(props: DisputeProps): Dispute {
    return new Dispute(props);
  }

  /**
   * A administração decide.
   *
   * A favor do comprador, o `Deal` vai a `REFUNDED` e o escrow é estornado
   * (T15 + E3). A favor do criador, a disputa deixa de bloquear e o fluxo
   * normal retoma — a aprovação volta a poder libertar o dinheiro.
   */
  resolve(input: {
    resolution: DisputeResolution;
    decidedByUserId: string;
    note: string | null;
    now: Date;
  }): void {
    this.assertOpen();

    this.props.status = 'RESOLVED';
    this.props.resolution = input.resolution;
    this.props.decidedByUserId = input.decidedByUserId;
    this.props.decisionNote = input.note?.trim() || null;
    this.props.decidedAt = input.now;
  }

  /** As partes entenderam-se antes da decisão, e o fluxo normal retoma. */
  withdraw(now: Date): void {
    this.assertOpen();

    this.props.status = 'WITHDRAWN';
    this.props.decidedAt = now;
  }

  get id(): string {
    return this.props.id;
  }

  get dealId(): string {
    return this.props.dealId;
  }

  get status(): DisputeStatus {
    return this.props.status;
  }

  get resolution(): DisputeResolution | null {
    return this.props.resolution;
  }

  get openedByUserId(): string {
    return this.props.openedByUserId;
  }

  get isOpen(): boolean {
    return this.props.status === 'OPEN';
  }

  toProps(): DisputeProps {
    return { ...this.props };
  }

  private assertOpen(): void {
    if (this.props.status !== 'OPEN') {
      throw new DisputeNotOpenError(this.props.status);
    }
  }
}
