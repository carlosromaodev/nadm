import { Injectable } from '@nestjs/common';
import { ContentRepository } from '@/modules/content/application/ports/content.repository';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { OutboxRepository } from '@/shared/application/ports/outbox.repository';
import type { TxContext } from '@/shared/application/transaction';
import { OffersRepository } from '@/modules/profiles/application/ports/profiles.repository';
import type { Deal } from '../../domain/deal';
import { STATE_CHANGE_BODY } from '../../domain/message';
import { MessagesRepository } from '../ports/conversation.repository';
import { EscrowReleaseService } from './escrow-release';

/**
 * UC-09 — comprar conteúdo bloqueado.
 *
 * **Não há nada para o criador aceitar nem para entregar.** O ficheiro já
 * existe; o que faltava era o direito de o ver. Por isso, capturado o
 * pagamento, o `Deal` percorre o resto do caminho de uma vez — T2, T8, T9 e
 * T12 — e o `ContentGrant` é concedido **na mesma transacção**.
 *
 * Corre dentro da transacção da captura, e é isso que garante o que interessa:
 * ou o comprador fica com o acesso e o criador com o dinheiro, ou não acontece
 * nada. Um acesso concedido sem o dinheiro ter sido libertado — ou o contrário
 * — seria pior do que a compra ter falhado.
 */
@Injectable()
export class FulfilContentUnlockUseCase {
  constructor(
    private readonly contents: ContentRepository,
    private readonly offers: OffersRepository,
    private readonly messages: MessagesRepository,
    private readonly escrowRelease: EscrowReleaseService,
    private readonly outbox: OutboxRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly ids: IdGenerator,
  ) {}

  /** Verdadeiro quando este `Deal` é uma compra de conteúdo. */
  applies(deal: Deal): boolean {
    return deal.offerSnapshot.kind === 'CONTENT_UNLOCK';
  }

  async execute(deal: Deal, now: Date, tx: TxContext): Promise<void> {
    const offer = await this.offers.findById(deal.offerSnapshot.offerId, tx);

    // Sem publicação atrás da oferta não há o que desbloquear. Deixar o `Deal`
    // pago e por entregar é o desfecho certo: o dinheiro fica retido e a
    // reconciliação apanha-o, em vez de se libertar por nada.
    if (!offer?.contentItemId) return;

    const item = await this.contents.findItem(offer.contentItemId, tx);

    if (!item) return;

    // T2 e T8, um a seguir ao outro: não há decisão do criador nem trabalho a
    // fazer, e fingir que há seria mentir na linha do tempo da conversa.
    deal.accept(now);
    deal.markDelivered(now);

    await this.contents.createGrant(
      {
        id: this.ids.next(),
        contentId: item.id,
        userId: deal.buyerUserId,
        source: 'PURCHASE',
        grantedAt: now,
        expiresAt: null,
        revokedAt: null,
      },
      tx,
    );

    await this.messages.create(
      {
        id: this.ids.next(),
        dealId: deal.id,
        senderUserId: null,
        kind: 'STATE_CHANGE',
        body: STATE_CHANGE_BODY.CONTENT_UNLOCKED,
        clientId: null,
        createdAt: now,
      },
      tx,
    );

    // T9 e T12: aprovada e liquidada. Quem aprova é o sistema, porque não há
    // entrega para o comprador julgar — ele já tem o que comprou.
    deal.approve(now);

    await this.escrowRelease.release(deal, null, now, tx);

    await this.outbox.enqueue(
      {
        type: 'content.unlocked',
        payload: { dealId: deal.id, contentId: item.id, userId: deal.buyerUserId },
        availableAt: now,
      },
      tx,
    );

    await this.auditLog.record(
      {
        actorUserId: null,
        actorKind: 'SYSTEM',
        action: 'content.unlocked',
        subjectType: 'Content',
        subjectId: item.id,
        metadata: { dealId: deal.id, buyerUserId: deal.buyerUserId },
      },
      tx,
    );
  }
}
