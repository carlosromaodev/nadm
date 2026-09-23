import type { TxContext } from '@/shared/application/transaction';
import { Money } from '@/shared/domain/money';
import type { LedgerAccount, LedgerTransaction } from '../../domain/ledger-transaction';

export abstract class LedgerRepository {
  /**
   * Grava o lançamento. Devolve `false` quando a chave semântica já existia —
   * é a terceira camada de idempotência, a que trava uma retentativa de tarefa
   * a duplicar lançamentos (RN-104).
   */
  abstract record(transaction: LedgerTransaction, tx?: TxContext): Promise<boolean>;

  abstract existsByExternalReference(
    kind: string,
    externalReference: string,
    tx?: TxContext,
  ): Promise<boolean>;

  /**
   * Soma algébrica das entradas: **débitos menos créditos**, a mesma convenção
   * de `LedgerEntry.signedAmount`. A fonte de verdade é esta, nunca a carteira.
   *
   * Numa conta de passivo — `CREATOR_AVAILABLE`, `ESCROW`, `REFUNDS_PAYABLE` —
   * um valor em dívida dá saldo **negativo**, porque a dívida entra a crédito.
   * Para saber quanto se deve a alguém, usa `amountOwed`.
   */
  abstract balanceOf(
    account: LedgerAccount,
    subjectId: string,
    tx?: TxContext,
  ): Promise<Money>;

  /**
   * Quanto a plataforma deve ao sujeito, numa conta de passivo. Positivo quando
   * há dívida.
   *
   * É a inversão de sinal de `balanceOf`, e existe para essa inversão viver
   * **num sítio só**. Espalhada por casos de uso, mais tarde ou mais cedo um
   * deles esquece-se dela e autoriza um levantamento sobre saldo zero.
   */
  async amountOwed(
    account: LedgerAccount,
    subjectId: string,
    tx?: TxContext,
  ): Promise<Money> {
    const saldo = await this.balanceOf(account, subjectId, tx);

    return Money.zero(saldo.currency).subtract(saldo);
  }

  abstract listBySubject(
    subjectId: string,
    limit: number,
    tx?: TxContext,
  ): Promise<LedgerEntryView[]>;
}

export interface LedgerEntryView {
  id: string;
  transactionId: string;
  transactionKind: string;
  description: string;
  account: LedgerAccount;
  direction: 'DEBIT' | 'CREDIT';
  amount: Money;
  dealId: string | null;
  occurredAt: Date;
}

export abstract class WalletsRepository {
  abstract findByProfile(profileId: string, tx?: TxContext): Promise<WalletView | null>;

  /** Recalcula a projecção a partir do razão. Ver RN-103. */
  abstract recomputeFromLedger(
    profileId: string,
    recomputedAt: Date,
    tx?: TxContext,
  ): Promise<WalletView>;
}

export interface WalletView {
  profileId: string;
  available: Money;
  reserved: Money;
  pending: Money;
  recomputedAt: Date;
}
