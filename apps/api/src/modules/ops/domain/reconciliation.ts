import { BusinessRuleError } from '@/core/errors/domain-error';

export const FINDING_KINDS = [
  /** Uma intenção de pagamento presa em `PENDING` há tempo de mais. */
  'STUCK_PAYMENT_INTENT',
  /** Uma captura registada sem o lançamento no razão que devia acompanhá-la. */
  'CAPTURE_WITHOUT_LEDGER',
  /** O saldo do razão e a projecção `Wallet` discordam. */
  'WALLET_DIVERGENCE',
  /** Um levantamento a caminho do parceiro há tempo de mais. */
  'STUCK_PAYOUT',
  /** Uma transacção do razão cujas entradas não somam zero. */
  'UNBALANCED_LEDGER',
  /** Escrow retido num `Deal` que já fechou. */
  'ESCROW_ON_CLOSED_DEAL',
] as const;

export type FindingKind = (typeof FINDING_KINDS)[number];

export const FINDING_STATUSES = ['OPEN', 'RESOLVED', 'ACCEPTED'] as const;

export type FindingStatus = (typeof FINDING_STATUSES)[number];

/**
 * A gravidade decide o que acorda alguém a meio da noite.
 *
 * `CRITICAL` é dinheiro que não bate certo — o razão desequilibrado ou escrow
 * preso num negócio fechado. `WARNING` é coisa que pode ser atraso do parceiro
 * e resolver-se sozinha, e que só passa a problema se persistir.
 */
export type FindingSeverity = 'WARNING' | 'CRITICAL';

export const SEVERITY_BY_KIND: Readonly<Record<FindingKind, FindingSeverity>> = {
  STUCK_PAYMENT_INTENT: 'WARNING',
  CAPTURE_WITHOUT_LEDGER: 'CRITICAL',
  WALLET_DIVERGENCE: 'CRITICAL',
  STUCK_PAYOUT: 'WARNING',
  UNBALANCED_LEDGER: 'CRITICAL',
  ESCROW_ON_CLOSED_DEAL: 'CRITICAL',
};

export class FindingNotOpenError extends BusinessRuleError {
  constructor(status: FindingStatus) {
    super(`A finding in ${status} has already been dealt with`);
  }
}

export class ResolutionNoteRequiredError extends BusinessRuleError {
  constructor() {
    super('Closing a finding requires saying what was done about it');
  }
}

export interface FindingProps {
  id: string;
  kind: FindingKind;
  severity: FindingSeverity;
  status: FindingStatus;
  /**
   * O que a divergência é sobre: um `Deal`, um `Payout`, um perfil.
   *
   * Junto com `kind`, é a chave que impede a mesma divergência de ser
   * registada a cada passagem da tarefa — ver `fingerprint`.
   */
  subjectType: string;
  subjectId: string;
  /** Explicação legível, já sem dados sensíveis. */
  detail: string;
  /** Números que ajudam a perceber o tamanho do problema, em string. */
  metadata: Record<string, string>;
  detectedAt: Date;
  resolvedAt: Date | null;
  resolvedByUserId: string | null;
  resolutionNote: string | null;
}

/**
 * A identidade de uma divergência, para não a registar duas vezes.
 *
 * A tarefa de reconciliação corre todos os dias sobre os mesmos dados: sem
 * isto, uma intenção presa há uma semana produziria sete registos iguais e a
 * lista deixaria de se poder ler.
 */
export function fingerprint(kind: FindingKind, subjectId: string): string {
  return `${kind}:${subjectId}`;
}

/**
 * Uma divergência entre o que o sistema diz e o que o sistema fez.
 *
 * **Nenhuma correcção é automática.** Uma divergência de dinheiro decide-se por
 * uma pessoa, com registo de auditoria (SDD §11.5) — o que esta entidade faz é
 * garantir que ninguém a fecha sem dizer o que fez.
 */
export class ReconciliationFinding {
  private constructor(private readonly props: FindingProps) {}

  static detect(input: {
    id: string;
    kind: FindingKind;
    subjectType: string;
    subjectId: string;
    detail: string;
    metadata?: Record<string, string>;
    now: Date;
  }): ReconciliationFinding {
    return new ReconciliationFinding({
      id: input.id,
      kind: input.kind,
      severity: SEVERITY_BY_KIND[input.kind],
      status: 'OPEN',
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      detail: input.detail,
      metadata: input.metadata ?? {},
      detectedAt: input.now,
      resolvedAt: null,
      resolvedByUserId: null,
      resolutionNote: null,
    });
  }

  static reconstitute(props: FindingProps): ReconciliationFinding {
    return new ReconciliationFinding(props);
  }

  /** Resolvida: alguém foi lá, percebeu e corrigiu. */
  resolve(userId: string, note: string, now: Date): void {
    this.close('RESOLVED', userId, note, now);
  }

  /**
   * Aceite: alguém foi lá, percebeu, e decidiu que está bem assim.
   *
   * É diferente de resolvida, e a diferença importa — uma divergência aceite
   * sem nada mudar é um sinal sobre o sistema, não sobre aquele dia.
   */
  accept(userId: string, note: string, now: Date): void {
    this.close('ACCEPTED', userId, note, now);
  }

  get id(): string {
    return this.props.id;
  }

  get kind(): FindingKind {
    return this.props.kind;
  }

  get severity(): FindingSeverity {
    return this.props.severity;
  }

  get status(): FindingStatus {
    return this.props.status;
  }

  get fingerprint(): string {
    return fingerprint(this.props.kind, this.props.subjectId);
  }

  toProps(): FindingProps {
    return { ...this.props };
  }

  private close(
    status: Exclude<FindingStatus, 'OPEN'>,
    userId: string,
    note: string,
    now: Date,
  ): void {
    if (this.props.status !== 'OPEN') {
      throw new FindingNotOpenError(this.props.status);
    }

    if (!note.trim()) {
      throw new ResolutionNoteRequiredError();
    }

    this.props.status = status;
    this.props.resolvedByUserId = userId;
    this.props.resolutionNote = note.trim();
    this.props.resolvedAt = now;
  }
}
