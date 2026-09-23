import { describe, expect, it } from 'vitest';
import { Money } from '@/shared/domain/money';
import {
  EmptyLedgerTransactionError,
  LedgerTransaction,
  NonPositiveLedgerEntryError,
  UnbalancedLedgerTransactionError,
  type LedgerEntryInput,
} from './ledger-transaction';

const OCCURRED_AT = new Date('2026-09-17T09:00:00.000Z');

function transaction(entries: LedgerEntryInput[]) {
  return LedgerTransaction.create({
    id: 'tx-1',
    kind: 'ESCROW_RELEASE',
    externalReference: 'ledger:release:deal-1',
    dealId: 'deal-1',
    description: 'Libertação do escrow',
    occurredAt: OCCURRED_AT,
    entries,
  });
}

describe('LedgerTransaction', () => {
  it('aceita um lançamento cuja soma algébrica é zero (RN-100)', () => {
    const tx = transaction([
      {
        account: 'ESCROW',
        subjectType: 'DEAL',
        subjectId: 'deal-1',
        direction: 'DEBIT',
        amount: Money.fromMinor(5_000_000n),
      },
      {
        account: 'CREATOR_AVAILABLE',
        subjectType: 'PROFILE',
        subjectId: 'profile-1',
        direction: 'CREDIT',
        amount: Money.fromMinor(4_250_000n),
      },
      {
        account: 'PLATFORM_FEE_REVENUE',
        subjectType: 'PLATFORM',
        subjectId: 'platform',
        direction: 'CREDIT',
        amount: Money.fromMinor(750_000n),
      },
    ]);

    expect(tx.entries).toHaveLength(3);
    expect(tx.total.amountMinor).toBe(5_000_000n);
  });

  it('recusa um lançamento que não fecha, nem que seja por um cêntimo', () => {
    expect(() =>
      transaction([
        {
          account: 'ESCROW',
          subjectType: 'DEAL',
          subjectId: 'deal-1',
          direction: 'DEBIT',
          amount: Money.fromMinor(5_000_000n),
        },
        {
          account: 'CREATOR_AVAILABLE',
          subjectType: 'PROFILE',
          subjectId: 'profile-1',
          direction: 'CREDIT',
          amount: Money.fromMinor(4_999_999n),
        },
      ]),
    ).toThrowError(UnbalancedLedgerTransactionError);
  });

  it('diz de quanto foi a diferença quando não fecha', () => {
    expect(() =>
      transaction([
        {
          account: 'ESCROW',
          subjectType: 'DEAL',
          subjectId: 'deal-1',
          direction: 'DEBIT',
          amount: Money.fromMinor(100n),
        },
        {
          account: 'CREATOR_AVAILABLE',
          subjectType: 'PROFILE',
          subjectId: 'profile-1',
          direction: 'CREDIT',
          amount: Money.fromMinor(60n),
        },
      ]),
    ).toThrowError(/off by 40 AOA/);
  });

  it('recusa uma entrada com valor zero ou negativo (RN-102)', () => {
    const base: LedgerEntryInput = {
      account: 'ESCROW',
      subjectType: 'DEAL',
      subjectId: 'deal-1',
      direction: 'DEBIT',
      amount: Money.fromMinor(0n),
    };

    expect(() => transaction([base, { ...base, direction: 'CREDIT' }])).toThrowError(
      NonPositiveLedgerEntryError,
    );

    expect(() =>
      transaction([
        { ...base, amount: Money.fromMinor(-100n) },
        { ...base, direction: 'CREDIT', amount: Money.fromMinor(-100n) },
      ]),
    ).toThrowError(NonPositiveLedgerEntryError);
  });

  it('recusa um lançamento com menos de duas entradas', () => {
    expect(() =>
      transaction([
        {
          account: 'ESCROW',
          subjectType: 'DEAL',
          subjectId: 'deal-1',
          direction: 'DEBIT',
          amount: Money.fromMinor(100n),
        },
      ]),
    ).toThrowError(EmptyLedgerTransactionError);
  });

  it('guarda a chave semântica que torna o lançamento idempotente (RN-104)', () => {
    const tx = transaction([
      {
        account: 'ESCROW',
        subjectType: 'DEAL',
        subjectId: 'deal-1',
        direction: 'DEBIT',
        amount: Money.fromMinor(100n),
      },
      {
        account: 'CREATOR_AVAILABLE',
        subjectType: 'PROFILE',
        subjectId: 'profile-1',
        direction: 'CREDIT',
        amount: Money.fromMinor(100n),
      },
    ]);

    expect(tx.externalReference).toBe('ledger:release:deal-1');
  });
});
