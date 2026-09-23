import { Injectable } from '@nestjs/common';
import {
  LedgerRepository,
  WalletsRepository,
} from '@/modules/ledger/application/ports/ledger.repository';
import {
  LedgerTransaction,
  PLATFORM_SUBJECT_ID,
  type LedgerEntryInput,
} from '@/modules/ledger/domain/ledger-transaction';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { OutboxRepository } from '@/shared/application/ports/outbox.repository';
import type { TxContext } from '@/shared/application/transaction';
import type { Deal } from '../../domain/deal';
import { STATE_CHANGE_BODY } from '../../domain/message';
import { MessagesRepository } from '../ports/conversation.repository';
import { DealsRepository } from '../ports/deals.repository';

/** Chave semântica que torna a libertação idempotente sob retentativa (RN-104). */
export function releaseReference(dealId: string): string {
  return `ledger:release:${dealId}`;
}

/**
 * As entradas da libertação.
 *
 * O criador é creditado pelo **preço** e debitado pela sua metade da taxa, em
 * vez de creditado já pelo líquido: é assim que o design apresenta os
 * movimentos da carteira, com a entrada e a taxa em linhas separadas. O líquido
 * é exactamente o mesmo, e a transacção continua a somar zero.
 *
 * Entradas de valor zero são omitidas — o razão só aceita valores positivos
 * (RN-102), e uma taxa de 0% não deve inventar uma linha vazia.
 */
export function releaseEntries(deal: Deal): LedgerEntryInput[] {
  const entries: LedgerEntryInput[] = [
    {
      account: 'ESCROW',
      subjectType: 'DEAL',
      subjectId: deal.id,
      direction: 'DEBIT',
      amount: deal.amount,
    },
    {
      account: 'CREATOR_AVAILABLE',
      subjectType: 'PROFILE',
      subjectId: deal.creatorProfileId,
      direction: 'CREDIT',
      amount: deal.price,
    },
  ];

  if (deal.creatorFee.isPositive) {
    entries.push({
      account: 'CREATOR_AVAILABLE',
      subjectType: 'PROFILE',
      subjectId: deal.creatorProfileId,
      direction: 'DEBIT',
      amount: deal.creatorFee,
    });
  }

  if (deal.platformFee.isPositive) {
    entries.push({
      account: 'PLATFORM_FEE_REVENUE',
      subjectType: 'PLATFORM',
      subjectId: PLATFORM_SUBJECT_ID,
      direction: 'CREDIT',
      amount: deal.platformFee,
    });
  }

  return entries;
}

/**
 * T12 + E2 — o escrow passa para a carteira do criador.
 *
 * Vive fora dos casos de uso porque tem dois chamadores: a aprovação de uma
 * entrega (T9) e o desbloqueio automático de conteúdo pago (UC-09), em que não
 * há entrega nenhuma para aprovar. Uma segunda cópia desta lógica seria uma
 * segunda oportunidade de a escrever mal — e é a que move dinheiro.
 *
 * **Não abre transacção nenhuma.** Corre dentro da de quem chama, que é o que
 * garante que a mudança de estado, o lançamento e o outbox são atómicos.
 */
@Injectable()
export class EscrowReleaseService {
  constructor(
    private readonly deals: DealsRepository,
    private readonly messages: MessagesRepository,
    private readonly ledger: LedgerRepository,
    private readonly wallets: WalletsRepository,
    private readonly outbox: OutboxRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly ids: IdGenerator,
  ) {}

  async release(
    deal: Deal,
    actorUserId: string | null,
    now: Date,
    tx: TxContext,
  ): Promise<void> {
    deal.settle(now);

    const recorded = await this.ledger.record(
      LedgerTransaction.create({
        id: this.ids.next(),
        kind: 'ESCROW_RELEASE',
        externalReference: releaseReference(deal.id),
        dealId: deal.id,
        description: `Libertação do escrow do pedido ${deal.reference}`,
        occurredAt: now,
        entries: releaseEntries(deal),
      }),
      tx,
    );

    await this.deals.save(deal, tx);

    if (!recorded) {
      // A chave semântica já existia: o dinheiro já tinha sido lançado numa
      // tentativa anterior. Reconciliar o estado do `Deal` é tudo o que falta.
      return;
    }

    await this.wallets.recomputeFromLedger(deal.creatorProfileId, now, tx);

    await this.messages.create(
      {
        id: this.ids.next(),
        dealId: deal.id,
        senderUserId: null,
        kind: 'STATE_CHANGE',
        body: STATE_CHANGE_BODY.PAID,
        clientId: null,
        createdAt: now,
      },
      tx,
    );

    await this.outbox.enqueue(
      {
        type: 'escrow.released',
        payload: {
          dealId: deal.id,
          creatorProfileId: deal.creatorProfileId,
          creatorNetMinor: deal.creatorNet.amountMinor.toString(),
        },
        availableAt: now,
      },
      tx,
    );

    await this.auditLog.record(
      {
        actorUserId,
        actorKind: 'SYSTEM',
        action: 'escrow.released',
        subjectType: 'Deal',
        subjectId: deal.id,
        metadata: {
          amountMinor: deal.amount.amountMinor.toString(),
          creatorNetMinor: deal.creatorNet.amountMinor.toString(),
          platformFeeMinor: deal.platformFee.amountMinor.toString(),
        },
      },
      tx,
    );
  }
}
