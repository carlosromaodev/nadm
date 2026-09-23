import { Injectable } from '@nestjs/common';
import { LedgerRepository } from '@/modules/ledger/application/ports/ledger.repository';
import { LedgerTransaction } from '@/modules/ledger/domain/ledger-transaction';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import type { AuditActorKind } from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { OutboxRepository } from '@/shared/application/ports/outbox.repository';
import type { TxContext } from '@/shared/application/transaction';
import type { Deal } from '../../domain/deal';
import { STATE_CHANGE_BODY } from '../../domain/message';
import { MessagesRepository } from '../ports/conversation.repository';

/** Chave semântica que torna o estorno idempotente sob retentativa (RN-104). */
export function refundReference(dealId: string): string {
  return `ledger:refund:${dealId}`;
}

/** O que aconteceu ao dinheiro quando o pedido morreu. */
export type EscrowClosure =
  /** E3 — havia valor retido e foi devolvido, com lançamento no razão. */
  | 'refunded'
  /** E4 — nunca chegou a haver dinheiro; não há nada para lançar. */
  | 'never_funded'
  /** O escrow já estava fechado; a retentativa não repete o lançamento. */
  | 'already_closed';

export interface CloseEscrowInput {
  deal: Deal;
  /** Porquê, em inglês e em forma de chave: `deal.declined`, `deal.expired`… */
  cause: string;
  actorUserId: string | null;
  actorKind: AuditActorKind;
}

/**
 * E3 e E4 — o lado do dinheiro de um pedido que termina sem entrega aprovada.
 *
 * Vive fora dos casos de uso porque três transições diferentes — recusa (T3),
 * expiração (T13) e devolução por atraso (T16) — fecham o dinheiro exactamente
 * da mesma maneira. Uma segunda cópia desta lógica seria uma segunda
 * oportunidade de a escrever mal.
 *
 * **Não abre transacção nenhuma.** Corre dentro da transacção de quem chama,
 * que é o que garante que a mudança de estado, o lançamento e o outbox são
 * atómicos.
 */
@Injectable()
export class EscrowRefundService {
  constructor(
    private readonly ledger: LedgerRepository,
    private readonly messages: MessagesRepository,
    private readonly outbox: OutboxRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly ids: IdGenerator,
  ) {}

  async closeEscrow(input: CloseEscrowInput, now: Date, tx: TxContext): Promise<EscrowClosure> {
    const { deal } = input;

    // E4 — o pedido morreu antes de alguém o pagar. Fechar o escrow é só
    // impedir que uma captura atrasada ainda encontre porta aberta.
    if (deal.escrowStatus === 'PENDING') {
      deal.markPaymentFailed();
      return 'never_funded';
    }

    if (deal.escrowStatus !== 'HELD') {
      return 'already_closed';
    }

    // O estorno é um lançamento novo, nunca uma reescrita do anterior (RN-093,
    // RN-101). O dinheiro sai do escrow e passa a ser dívida ao comprador; sai
    // da plataforma quando o parceiro confirmar a devolução, em F5.
    const transaction = LedgerTransaction.create({
      id: this.ids.next(),
      kind: 'ESCROW_REFUND',
      externalReference: refundReference(deal.id),
      dealId: deal.id,
      description: `Devolução do pedido ${deal.reference}`,
      occurredAt: now,
      entries: [
        {
          account: 'ESCROW',
          subjectType: 'DEAL',
          subjectId: deal.id,
          direction: 'DEBIT',
          amount: deal.amount,
        },
        {
          account: 'REFUNDS_PAYABLE',
          subjectType: 'DEAL',
          subjectId: deal.id,
          direction: 'CREDIT',
          amount: deal.amount,
        },
      ],
    });

    const recorded = await this.ledger.record(transaction, tx);

    deal.markEscrowRefunded();

    if (!recorded) {
      // A chave semântica já existia: o estorno tinha sido lançado numa
      // tentativa anterior que morreu antes de gravar o estado do `Deal`.
      // Reconciliar o estado é tudo o que falta fazer.
      return 'already_closed';
    }

    // A carteira do criador não se recalcula: um estorno não toca em
    // `CREATOR_AVAILABLE`, porque o criador nunca chegou a receber nada.

    await this.messages.create(
      {
        id: this.ids.next(),
        dealId: deal.id,
        senderUserId: null,
        kind: 'STATE_CHANGE',
        body: STATE_CHANGE_BODY.REFUNDED,
        clientId: null,
        createdAt: now,
      },
      tx,
    );

    await this.outbox.enqueue(
      {
        type: 'escrow.refunded',
        payload: {
          dealId: deal.id,
          buyerUserId: deal.buyerUserId,
          cause: input.cause,
          amountMinor: deal.amount.amountMinor.toString(),
        },
        availableAt: now,
      },
      tx,
    );

    await this.auditLog.record(
      {
        actorUserId: input.actorUserId,
        actorKind: input.actorKind,
        action: 'escrow.refunded',
        subjectType: 'Deal',
        subjectId: deal.id,
        metadata: { cause: input.cause, amountMinor: deal.amount.amountMinor.toString() },
      },
      tx,
    );

    return 'refunded';
  }
}
