import { Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { ResourceNotFoundError } from '@/core/errors/domain-error';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { TransactionRunner } from '@/shared/application/transaction';
import type { Deal } from '../../domain/deal';
import type { Dispute } from '../../domain/dispute';
import { NoOpenDisputeError } from '../../domain/dispute';
import type { Delivery } from '../../domain/delivery';
import type { Message } from '../../domain/message';
import {
  DeliveriesRepository,
  MessagesRepository,
} from '../ports/conversation.repository';
import { DealsRepository } from '../ports/deals.repository';
import { DisputesRepository } from '../ports/disputes.repository';

export interface AdminReadConversationInput {
  adminUserId: string;
  dealId: string;
  messageLimit?: number;
}

export interface AdminConversation {
  deal: Deal;
  messages: Message[];
  deliveries: Delivery[];
  dispute: Dispute;
}

/**
 * RN-064 — a administração lê a conversa de um `Deal` alheio.
 *
 * **Só com disputa aberta, e sempre com registo de auditoria.** É a única
 * maneira de alguém de fora ver a conversa de outras duas pessoas, e o preço de
 * o poder fazer é ficar escrito que o fez, quando e sobre quem.
 *
 * Sem disputa aberta, a resposta é a mesma que dariamos a qualquer estranho:
 * o recurso não existe. A investigação registada — o outro caminho que RN-064
 * admite — depende do painel de administração e chega em F10.
 */
@Injectable()
export class AdminReadConversationUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly deals: DealsRepository,
    private readonly messages: MessagesRepository,
    private readonly deliveries: DeliveriesRepository,
    private readonly disputes: DisputesRepository,
    private readonly auditLog: AuditLogRepository,
  ) {}

  async execute(input: AdminReadConversationInput): Promise<AdminConversation> {
    return this.transactions.run(async (tx) => {
      const deal = await this.deals.findById(input.dealId, tx);

      if (!deal) {
        throw new ResourceNotFoundError('Deal', input.dealId);
      }

      const dispute = await this.disputes.findOpenByDeal(deal.id, tx);

      if (!dispute) {
        throw new NoOpenDisputeError();
      }

      // A auditoria escreve-se **antes** de devolver o conteúdo: se a escrita
      // falhar, a transacção reverte e ninguém leu nada sem deixar rasto.
      await this.auditLog.record(
        {
          actorUserId: input.adminUserId,
          actorKind: 'USER',
          action: 'admin.conversation_read',
          subjectType: 'Deal',
          subjectId: deal.id,
          metadata: { disputeId: dispute.id },
        },
        tx,
      );

      return {
        deal,
        messages: await this.messages.listByDeal(deal.id, input.messageLimit ?? 200, tx),
        deliveries: await this.deliveries.listByDeal(deal.id, tx),
        dispute,
      };
    });
  }
}

export interface AdminPostMessageInput {
  adminUserId: string;
  dealId: string;
  body: string;
}

/**
 * A administração escreve na conversa, durante uma disputa.
 *
 * A mensagem é de tipo `SYSTEM` e **não** de `TEXT`: as duas partes têm de
 * distinguir à primeira vista o que veio da plataforma do que veio da outra
 * pessoa. E `senderUserId` fica a `null` — quem fala é a NaDM, não o
 * administrador em nome próprio.
 */
@Injectable()
export class AdminPostMessageUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly deals: DealsRepository,
    private readonly messages: MessagesRepository,
    private readonly disputes: DisputesRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: AdminPostMessageInput): Promise<Message> {
    const now = this.clock.now();
    const body = input.body.trim();

    return this.transactions.run(async (tx) => {
      const deal = await this.deals.findById(input.dealId, tx);

      if (!deal) {
        throw new ResourceNotFoundError('Deal', input.dealId);
      }

      const dispute = await this.disputes.findOpenByDeal(deal.id, tx);

      if (!dispute) {
        throw new NoOpenDisputeError();
      }

      const message = await this.messages.create(
        {
          id: this.ids.next(),
          dealId: deal.id,
          senderUserId: null,
          kind: 'SYSTEM',
          body,
          clientId: null,
          createdAt: now,
        },
        tx,
      );

      deal.touchConversation(now);
      await this.deals.save(deal, tx);

      await this.auditLog.record(
        {
          actorUserId: input.adminUserId,
          actorKind: 'USER',
          action: 'admin.conversation_message',
          subjectType: 'Deal',
          subjectId: deal.id,
          metadata: { disputeId: dispute.id, messageId: message.id },
        },
        tx,
      );

      return message;
    });
  }
}
