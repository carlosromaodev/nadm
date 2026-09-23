import { Injectable } from '@nestjs/common';
import { DealsRepository } from '@/modules/deals/application/ports/deals.repository';
import { ProfilesRepository } from '@/modules/profiles/application/ports/profiles.repository';
import type { TxContext } from '@/shared/application/transaction';
import { DIRECT_MATRIX, EVENT_MATRIX } from '../../domain/event-matrix';
import {
  notificationKey,
  SMS_PERMITIDO,
  type ChannelKind,
  type NotificationPlan,
  type Party,
} from '../../domain/notification';

export interface PlannableEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

function texto(payload: Record<string, unknown>, chave: string): string | null {
  const valor = payload[chave];

  return typeof valor === 'string' ? valor : null;
}

/**
 * Decide quem é notificado de quê, e por onde.
 *
 * Tudo o que é decisão de produto está na matriz (`event-matrix.ts`); o que
 * está aqui são as **regras** de §14.3, que se aplicam por cima dela: o SMS
 * restrito e o autor de uma mensagem não ser avisado da sua própria mensagem.
 *
 * O silêncio nocturno não é aqui: é do trabalhador, porque é sobre **quando** e
 * não sobre **quem**.
 */
@Injectable()
export class NotificationPlanner {
  constructor(
    private readonly deals: DealsRepository,
    private readonly profiles: ProfilesRepository,
  ) {}

  async plan(event: PlannableEvent, tx?: TxContext): Promise<NotificationPlan[]> {
    const directo = DIRECT_MATRIX[event.type];

    if (directo) {
      const userId =
        texto(event.payload, 'userId') ?? (await this.creatorOf(event.payload, tx));

      if (!userId) return [];

      return this.montar(event, [userId], directo.channels, directo.template);
    }

    const entrada = EVENT_MATRIX[event.type];

    // Um evento fora da matriz não notifica ninguém. Os de operação são para o
    // painel da administração, não para acordar um criador.
    if (!entrada) return [];

    const dealId = texto(event.payload, 'dealId');

    if (!dealId) return [];

    const deal = await this.deals.findById(dealId, tx);

    if (!deal) return [];

    const porPapel: Record<Party, string> = {
      buyer: deal.buyerUserId,
      creator: deal.creatorUserId,
    };

    let destinatarios = entrada.to.map((papel) => porPapel[papel]);

    // Quem escreveu já sabe que escreveu.
    const autor = texto(event.payload, 'senderUserId');

    if (autor) {
      destinatarios = destinatarios.filter((userId) => userId !== autor);
    }

    return this.montar(event, destinatarios, entrada.channels, entrada.template, {
      dealId: deal.id,
      reference: deal.reference,
    });
  }

  /** O criador de um `Deal`, para os eventos que só trazem o perfil. */
  private async creatorOf(
    payload: Record<string, unknown>,
    tx?: TxContext,
  ): Promise<string | null> {
    const profileId = texto(payload, 'profileId') ?? texto(payload, 'creatorProfileId');

    if (!profileId) return null;

    const profile = await this.profiles.findById(profileId, tx);

    return profile?.userId ?? null;
  }

  private montar(
    event: PlannableEvent,
    destinatarios: string[],
    canais: readonly ChannelKind[],
    template: string,
    extra: Record<string, string> = {},
  ): NotificationPlan[] {
    // SDD §14.3 — o SMS custa dinheiro e interrompe. A matriz pode pedi-lo; a
    // lista curta é que decide se ele sai.
    const permitidos = canais.filter(
      (canal) => canal !== 'SMS' || SMS_PERMITIDO.has(event.type),
    );

    if (!permitidos.length) return [];

    return [...new Set(destinatarios)].flatMap((recipientUserId) =>
      permitidos.map((canal) => ({
        recipientUserId,
        channels: [canal],
        template,
        idempotencyKey: notificationKey(event.id, recipientUserId, canal),
        data: { ...extra, event: event.type },
      })),
    );
  }
}
