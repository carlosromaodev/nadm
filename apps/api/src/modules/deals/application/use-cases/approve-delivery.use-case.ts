import { Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { ResourceConflictError } from '@/core/errors/domain-error';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { TransactionRunner, type TxContext } from '@/shared/application/transaction';
import { type Deal } from '../../domain/deal';
import { DisputeBlocksReleaseError } from '../../domain/dispute';
import { InvalidDealTransitionError } from '../../domain/errors';
import { STATE_CHANGE_BODY } from '../../domain/message';
import {
  DeliveriesRepository,
  MessagesRepository,
} from '../ports/conversation.repository';
import { DealsRepository } from '../ports/deals.repository';
import { DisputesRepository } from '../ports/disputes.repository';
import { requireBuyer, requireExistingDeal, requireParticipant } from './deal-access';
import { EscrowReleaseService } from './escrow-release';

export interface ApproveDeliveryInput {
  /**
   * `null` quando quem aprova é o sistema, em T10 — passaram as horas da janela
   * de aprovação sem o comprador responder. É o único caso em que não há
   * comprador a confirmar, e por isso o único em que o guarda de relação não se
   * aplica: quem chama é o agendador, não um pedido HTTP.
   */
  actorUserId: string | null;
  dealId: string;
  expectedVersion?: number;
}

/**
 * T9 + T12 + E2 — o comprador aprova e o dinheiro liberta-se. Em T10 é o
 * sistema a aprovar por ele, pelo mesmo caminho.
 *
 * Aprovação, lançamento no razão e escrita no outbox acontecem na mesma
 * transacção: ou tudo, ou nada.
 *
 * O caso de uso é retomável de propósito. Se a transacção morrer depois de
 * gravar a aprovação e antes do lançamento, chamar outra vez completa o que
 * faltou em vez de falhar — é o caminho de recuperação de SDD §UC-08 E2.
 */
@Injectable()
export class ApproveDeliveryUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly deals: DealsRepository,
    private readonly deliveries: DeliveriesRepository,
    private readonly messages: MessagesRepository,
    private readonly disputes: DisputesRepository,
    private readonly escrowRelease: EscrowReleaseService,
    private readonly auditLog: AuditLogRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: ApproveDeliveryInput): Promise<Deal> {
    const now = this.clock.now();

    return this.transactions.run(async (tx) => {
      const found = await this.deals.findById(input.dealId, tx);
      const actorUserId = input.actorUserId;

      const deal =
        actorUserId === null
          ? requireExistingDeal(found, input.dealId)
          : requireBuyer(
              requireParticipant(found, actorUserId, input.dealId),
              actorUserId,
            );

      if (input.expectedVersion !== undefined) {
        const latest = await this.deliveries.findLatest(deal.id, tx);
        if (!latest || latest.version !== input.expectedVersion) {
          throw new ResourceConflictError('A entrega mudou. Abre a versão mais recente antes de aprovar.');
        }
      }

      // Já concluído: devolver como está é a resposta certa a um duplo clique.
      if (deal.status === 'PAID') {
        return deal;
      }

      // RN-048 — com disputa aberta, o dinheiro não se move. A verificação corre
      // **dentro da transacção**: uma disputa aberta entre a leitura do `Deal` e
      // o lançamento no razão não pode passar despercebida.
      if (await this.disputes.findOpenByDeal(deal.id, tx)) {
        throw new DisputeBlocksReleaseError();
      }

      if (deal.status === 'DELIVERED') {
        await this.approve(deal, actorUserId, now, tx);
      } else if (deal.status !== 'APPROVED') {
        throw new InvalidDealTransitionError(deal.status, 'APPROVED');
      }

      await this.escrowRelease.release(deal, actorUserId, now, tx);

      return deal;
    });
  }

  /** T9 — a aprovação em si. */
  private async approve(
    deal: Deal,
    actorUserId: string | null,
    now: Date,
    tx: TxContext,
  ): Promise<void> {
    deal.approve(now);

    const delivery = await this.deliveries.findLatest(deal.id, tx);

    if (delivery) {
      await this.deliveries.markAccepted(delivery.id, now, tx);
    }

    await this.deals.save(deal, tx);

    await this.messages.create(
      {
        id: this.ids.next(),
        dealId: deal.id,
        senderUserId: null,
        kind: 'STATE_CHANGE',
        body: actorUserId === null ? STATE_CHANGE_BODY.AUTO_APPROVED : STATE_CHANGE_BODY.APPROVED,
        clientId: null,
        createdAt: now,
      },
      tx,
    );

    await this.auditLog.record(
      {
        actorUserId,
        // T10 é um acto do sistema, e a auditoria tem de o dizer: ninguém
        // aprovou esta entrega, o prazo é que se esgotou.
        actorKind: actorUserId === null ? 'SYSTEM' : 'USER',
        action: actorUserId === null ? 'delivery.auto_approved' : 'delivery.approved',
        subjectType: 'Deal',
        subjectId: deal.id,
      },
      tx,
    );
  }

}
