import type { TxContext } from '@/shared/application/transaction';
import type {
  FindingStatus,
  ReconciliationFinding,
} from '../../domain/reconciliation';

export abstract class FindingsRepository {
  abstract findById(id: string, tx?: TxContext): Promise<ReconciliationFinding | null>;

  abstract list(
    filter: { status?: FindingStatus; limit: number },
    tx?: TxContext,
  ): Promise<ReconciliationFinding[]>;

  abstract countOpen(tx?: TxContext): Promise<number>;

  /**
   * Regista a divergência, **se ainda não estiver registada**.
   *
   * Devolve `false` quando já havia uma aberta com a mesma impressão digital.
   * Quem o garante a sério é o índice único parcial de 019: a tarefa pode
   * correr duas vezes ao mesmo tempo sem duplicar nada.
   */
  abstract recordIfNew(finding: ReconciliationFinding, tx?: TxContext): Promise<boolean>;

  abstract save(finding: ReconciliationFinding, tx?: TxContext): Promise<void>;
}

/** As consultas cruzadas da reconciliação. Leitura pura, sobre o que já existe. */
export abstract class ReconciliationQueries {
  /** Intenções presas em `CREATED`/`PENDING` desde antes do limite. */
  abstract stuckPaymentIntents(
    before: Date,
    tx?: TxContext,
  ): Promise<Array<{ id: string; dealId: string; since: Date }>>;

  /** Capturas confirmadas sem o lançamento no razão que devia acompanhá-las. */
  abstract capturesWithoutLedger(
    tx?: TxContext,
  ): Promise<Array<{ dealId: string; intentId: string; capturedAt: Date }>>;

  /** Perfis em que o razão e a projecção `Wallet` discordam. */
  abstract walletDivergences(
    tx?: TxContext,
  ): Promise<Array<{ profileId: string; ledgerMinor: bigint; walletMinor: bigint }>>;

  /** Levantamentos a caminho do parceiro desde antes do limite. */
  abstract stuckPayouts(
    before: Date,
    tx?: TxContext,
  ): Promise<Array<{ id: string; profileId: string; since: Date }>>;

  /** Transacções do razão cujas entradas não somam zero. Nunca devia haver. */
  abstract unbalancedLedgerTransactions(
    tx?: TxContext,
  ): Promise<Array<{ transactionId: string; differenceMinor: bigint }>>;

  /** `Deal` fechados com escrow ainda retido. */
  abstract escrowOnClosedDeals(
    tx?: TxContext,
  ): Promise<Array<{ dealId: string; reference: string; heldMinor: bigint }>>;
}
