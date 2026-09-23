import { BusinessRuleError } from '@/core/errors/domain-error';
import { Money } from '@/shared/domain/money';

export type LedgerAccount =
  | 'PROVIDER_CLEARING'
  | 'ESCROW'
  | 'CREATOR_AVAILABLE'
  | 'CREATOR_RESERVED'
  | 'PLATFORM_FEE_REVENUE'
  | 'REFUNDS_PAYABLE'
  | 'TAX_PAYABLE';

export type LedgerDirection = 'DEBIT' | 'CREDIT';

export type LedgerSubjectType = 'DEAL' | 'PROFILE' | 'PLATFORM';

/**
 * Sujeito das entradas que pertencem à plataforma e não a nenhum criador.
 *
 * Tem de ser um UUID porque `ledger_entries.subject_id` é `uuid`, e tem de ser
 * distinto do perfil do criador: caso contrário a comissão da plataforma
 * aparecia no extracto de quem a pagou.
 */
export const PLATFORM_SUBJECT_ID = '00000000-0000-0000-0000-000000000000';

export class UnbalancedLedgerTransactionError extends BusinessRuleError {
  constructor(difference: Money) {
    super(`Ledger transaction does not balance: off by ${difference.toString()}`);
  }
}

export class EmptyLedgerTransactionError extends BusinessRuleError {
  constructor() {
    super('A ledger transaction needs at least two entries');
  }
}

export class NonPositiveLedgerEntryError extends BusinessRuleError {
  constructor() {
    super('Ledger entry amounts are always positive; the sign lives in the direction');
  }
}

export interface LedgerEntryInput {
  account: LedgerAccount;
  subjectType: LedgerSubjectType;
  subjectId: string;
  direction: LedgerDirection;
  amount: Money;
}

export class LedgerEntry {
  constructor(
    readonly account: LedgerAccount,
    readonly subjectType: LedgerSubjectType,
    readonly subjectId: string,
    readonly direction: LedgerDirection,
    readonly amount: Money,
  ) {
    if (!amount.isPositive) {
      throw new NonPositiveLedgerEntryError();
    }
  }

  /** O sinal contabilístico: débito soma, crédito subtrai. */
  get signedAmount(): Money {
    return this.direction === 'DEBIT'
      ? this.amount
      : Money.zero(this.amount.currency).subtract(this.amount);
  }
}

export interface CreateLedgerTransactionInput {
  id: string;
  kind: string;
  /**
   * Chave semântica da operação, por exemplo `ledger:release:{dealId}`. É única
   * por tipo e é o que torna o lançamento idempotente sob retentativa (RN-104).
   */
  externalReference: string;
  dealId: string | null;
  description: string;
  occurredAt: Date;
  entries: LedgerEntryInput[];
}

/**
 * Lançamento de partidas dobradas. A soma algébrica das entradas é zero, e isso
 * é verificado aqui — antes de tocar na base de dados (RN-100).
 */
export class LedgerTransaction {
  private constructor(
    readonly id: string,
    readonly kind: string,
    readonly externalReference: string,
    readonly dealId: string | null,
    readonly description: string,
    readonly occurredAt: Date,
    readonly entries: readonly LedgerEntry[],
  ) {}

  static create(input: CreateLedgerTransactionInput): LedgerTransaction {
    if (input.entries.length < 2) {
      throw new EmptyLedgerTransactionError();
    }

    const entries = input.entries.map(
      (entry) =>
        new LedgerEntry(
          entry.account,
          entry.subjectType,
          entry.subjectId,
          entry.direction,
          entry.amount,
        ),
    );

    const currency = entries[0].amount.currency;
    const balance = entries.reduce(
      (sum, entry) => sum.add(entry.signedAmount),
      Money.zero(currency),
    );

    if (!balance.isZero) {
      throw new UnbalancedLedgerTransactionError(balance);
    }

    return new LedgerTransaction(
      input.id,
      input.kind,
      input.externalReference,
      input.dealId,
      input.description,
      input.occurredAt,
      entries,
    );
  }

  get currency() {
    return this.entries[0].amount.currency;
  }

  /** Total movimentado, para leitura — metade da soma dos valores absolutos. */
  get total(): Money {
    return this.entries
      .filter((entry) => entry.direction === 'DEBIT')
      .reduce((sum, entry) => sum.add(entry.amount), Money.zero(this.currency));
  }
}
