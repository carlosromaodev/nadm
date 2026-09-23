import { Injectable } from '@nestjs/common';
import { LedgerRepository } from '@/modules/ledger/application/ports/ledger.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import {
  LedgerTransaction,
  PLATFORM_SUBJECT_ID,
  type LedgerEntryInput,
} from '@/modules/ledger/domain/ledger-transaction';
import type { TxContext } from '@/shared/application/transaction';
import type { Payout } from '../../domain/payout';

/** Reserva o valor: sai de disponível, entra em reservado (RN-052). */
export function reserveReference(payoutId: string): string {
  return `ledger:payout-reserve:${payoutId}`;
}

/** O dinheiro saiu mesmo da plataforma. */
export function settleReference(payoutId: string): string {
  return `ledger:payout-settle:${payoutId}`;
}

/** O levantamento morreu e o valor volta a disponível, por estorno. */
export function reverseReference(payoutId: string): string {
  return `ledger:payout-reverse:${payoutId}`;
}

/**
 * Os três movimentos de um levantamento.
 *
 * Vive fora dos casos de uso porque cancelar e falhar estornam exactamente da
 * mesma maneira, e porque nenhum destes lançamentos deve poder ser escrito
 * solto: cada um corre dentro da transacção de quem muda o estado do `Payout`.
 */
@Injectable()
export class PayoutLedgerService {
  constructor(
    private readonly ledger: LedgerRepository,
    private readonly ids: IdGenerator,
  ) {}

  /**
   * RN-052 — pedir reserva imediatamente.
   *
   * O valor deixa de estar disponível no instante do pedido, e não quando a
   * administração aprovar. Entre uma coisa e outra, o criador não pode pedir a
   * mesma quantia outra vez.
   */
  async reserve(payout: Payout, now: Date, tx: TxContext): Promise<boolean> {
    return this.ledger.record(
      LedgerTransaction.create({
        id: this.ids.next(),
        kind: 'PAYOUT_RESERVE',
        externalReference: reserveReference(payout.id),
        dealId: null,
        description: `Reserva do levantamento ${payout.id}`,
        occurredAt: now,
        entries: [
          {
            account: 'CREATOR_AVAILABLE',
            subjectType: 'PROFILE',
            subjectId: payout.profileId,
            direction: 'DEBIT',
            amount: payout.amount,
          },
          {
            account: 'CREATOR_RESERVED',
            subjectType: 'PROFILE',
            subjectId: payout.profileId,
            direction: 'CREDIT',
            amount: payout.amount,
          },
        ],
      }),
      tx,
    );
  }

  /** O dinheiro saiu: a dívida ao criador extingue-se contra o parceiro. */
  async settle(payout: Payout, now: Date, tx: TxContext): Promise<boolean> {
    const entries: LedgerEntryInput[] = [
      {
        account: 'CREATOR_RESERVED',
        subjectType: 'PROFILE',
        subjectId: payout.profileId,
        direction: 'DEBIT',
        amount: payout.amount,
      },
      {
        account: 'PROVIDER_CLEARING',
        subjectType: 'PLATFORM',
        subjectId: PLATFORM_SUBJECT_ID,
        direction: 'CREDIT',
        amount: payout.net,
      },
    ];

    // A taxa do parceiro fica com a plataforma. Zero enquanto DP-04 não
    // fechar, e entradas de valor zero não se escrevem (RN-102).
    if (payout.fee.isPositive) {
      entries.push({
        account: 'PLATFORM_FEE_REVENUE',
        subjectType: 'PLATFORM',
        subjectId: PLATFORM_SUBJECT_ID,
        direction: 'CREDIT',
        amount: payout.fee,
      });
    }

    return this.ledger.record(
      LedgerTransaction.create({
        id: this.ids.next(),
        kind: 'PAYOUT_SETTLE',
        externalReference: settleReference(payout.id),
        dealId: null,
        description: `Liquidação do levantamento ${payout.id}`,
        occurredAt: now,
        entries,
      }),
      tx,
    );
  }

  /**
   * O valor reservado volta a disponível.
   *
   * **Lançamento novo, nunca alteração do anterior** (RN-101). A reserva que
   * falhou fica no razão para sempre, e ao lado dela fica o estorno que a
   * desfez — é assim que se lê a história do dinheiro.
   */
  async reverse(payout: Payout, now: Date, tx: TxContext): Promise<boolean> {
    return this.ledger.record(
      LedgerTransaction.create({
        id: this.ids.next(),
        kind: 'PAYOUT_REVERSE',
        externalReference: reverseReference(payout.id),
        dealId: null,
        description: `Estorno da reserva do levantamento ${payout.id}`,
        occurredAt: now,
        entries: [
          {
            account: 'CREATOR_RESERVED',
            subjectType: 'PROFILE',
            subjectId: payout.profileId,
            direction: 'DEBIT',
            amount: payout.amount,
          },
          {
            account: 'CREATOR_AVAILABLE',
            subjectType: 'PROFILE',
            subjectId: payout.profileId,
            direction: 'CREDIT',
            amount: payout.amount,
          },
        ],
      }),
      tx,
    );
  }
}
