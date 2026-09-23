import { Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { BusinessRuleError, ResourceNotFoundError } from '@/core/errors/domain-error';
import { ProfilesRepository } from '@/modules/profiles/application/ports/profiles.repository';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { TransactionRunner, type TxContext } from '@/shared/application/transaction';
import { Money } from '@/shared/domain/money';
import { OffersRepository } from '@/modules/profiles/application/ports/profiles.repository';
import { ContentRepository } from '../ports/content.repository';
import { ContentAccess } from '../content-access';
import type { ContentItem, ContentKind, ContentStatus, ContentVisibility } from '../../domain/content';

export interface SaveContentInput {
  id?: string;
  kind: ContentKind;
  caption: string;
  visibility: ContentVisibility;
  priceMinor: string;
  mediaIds: string[];
  previewMediaIds?: string[];
  folder?: string | null;
  status: ContentStatus;
  scheduledAt?: Date | null;
}

@Injectable()
export class SaveContentUseCase {
  constructor(private readonly transactions: TransactionRunner, private readonly contents: ContentRepository,
    private readonly profiles: ProfilesRepository, private readonly offers: OffersRepository,
    private readonly access: ContentAccess, private readonly clock: Clock,
    private readonly ids: IdGenerator, private readonly audit: AuditLogRepository) {}

  async execute(actorUserId: string, input: SaveContentInput) {
    const now = this.clock.now();
    const price = Money.fromMinor(input.priceMinor);
    if (price.isNegative || price.amountMinor > 9223372036854775807n) throw new BusinessRuleError('O preço está fora do intervalo permitido.');
    if (input.visibility === 'PAID' && price.amountMinor <= 0n) throw new BusinessRuleError('O conteúdo pago precisa de um preço maior que zero.');
    if (input.caption.length > 300) throw new BusinessRuleError('A legenda não pode ultrapassar 300 caracteres.');
    // `MEMBERS` continua por abrir: a recorrência de assinatura é DP-09, e sem
    // ela um direito de membro não sabe quando expira.
    if (input.status !== 'DRAFT' && input.visibility === 'MEMBERS') {
      throw new BusinessRuleError('A publicação para membros aguarda a decisão sobre assinaturas (DP-09).');
    }
    if (input.status === 'SCHEDULED' && (!input.scheduledAt || !Number.isFinite(input.scheduledAt.getTime()) || input.scheduledAt.getTime() <= now.getTime())) {
      throw new BusinessRuleError('Escolhe uma data de publicação futura.');
    }
    if (input.mediaIds.length > 20 || new Set(input.mediaIds).size !== input.mediaIds.length) throw new BusinessRuleError('Escolhe até 20 ficheiros distintos.');
    const previews = input.previewMediaIds ?? [];
    if (new Set(previews).size !== previews.length || previews.some((id) => !input.mediaIds.includes(id))) throw new BusinessRuleError('A pré-visualização tem de pertencer a esta publicação.');
    if (input.status !== 'DRAFT' && input.mediaIds.length === 0) throw new BusinessRuleError('Conclui o carregamento de um ficheiro antes de publicar.');
    if ((input.kind === 'PHOTO' || input.kind === 'VIDEO') && input.mediaIds.length > 1) throw new BusinessRuleError('Este tipo de publicação aceita um só ficheiro.');

    return this.transactions.run(async (tx) => {
      const profile = await this.profiles.findByUserId(actorUserId, tx);
      if (!profile) throw new ResourceNotFoundError('Profile', actorUserId);
      const existing = input.id ? await this.contents.findItem(input.id, tx) : null;
      if (input.id && (!existing || existing.profileId !== profile.id || existing.deletedAt !== null)) throw new ResourceNotFoundError('Content', input.id);
      for (const mediaId of input.mediaIds) {
        const media = await this.contents.findMedia(mediaId, tx);
        if (!media || media.ownerUserId !== actorUserId) throw new ResourceNotFoundError('Media', mediaId);
        const needsVideo = input.kind === 'VIDEO' || input.kind === 'PLAYLIST';
        if (needsVideo !== media.mimeType.startsWith('video/')) throw new BusinessRuleError(needsVideo ? 'Escolhe um vídeo para este formato.' : 'Escolhe uma imagem para este formato.');
      }
      const item: ContentItem = {
        id: existing?.id ?? this.ids.next(), profileId: profile.id, kind: input.kind, caption: input.caption.trim(), visibility: input.visibility,
        priceMinor: input.visibility === 'PAID' ? price.amountMinor : 0n, currency: 'AOA', mediaIds: input.mediaIds, previewMediaIds: previews,
        folder: input.folder?.trim() || null, status: input.status,
        scheduledAt: input.status === 'SCHEDULED' ? input.scheduledAt! : null,
        publishedAt: input.status === 'PUBLISHED' ? existing?.publishedAt ?? now : null,
        deletedAt: null, createdAt: existing?.createdAt ?? now, updatedAt: now,
      };
      await this.contents.saveItem(item, existing === null, tx);

      // Comprar conteúdo é comprar como tudo o resto: um `Deal`, com escrow,
      // razão e conversa. E um `Deal` precisa de uma `Offer` — por isso publicar
      // conteúdo pago cria a oferta que o desbloqueia, com o preço da
      // publicação. O criador põe o preço uma vez, e não gere duas coisas.
      if (item.visibility === 'PAID' && item.status !== 'DRAFT') {
        await this.ensureUnlockOffer(item, tx);
      }
      if (!existing) await this.contents.createGrant({ id: this.ids.next(), contentId: item.id, userId: actorUserId,
        source: 'OWNER', grantedAt: now, expiresAt: null, revokedAt: null }, tx);
      await this.audit.record({ actorUserId, actorKind: 'USER', action: existing ? 'content.updated' : 'content.created', subjectType: 'Content', subjectId: item.id,
        metadata: { status: item.status, visibility: item.visibility, kind: item.kind } }, tx);
      return this.access.view(item, actorUserId, true, tx);
    });
  }

  /**
   * A oferta de desbloqueio desta publicação.
   *
   * Uma por publicação, criada à primeira vez e actualizada depois — o preço
   * segue o da publicação, e não há dois sítios onde o mudar.
   */
  private async ensureUnlockOffer(item: ContentItem, tx: TxContext): Promise<void> {
    const existente = await this.offers.findByContentItem(item.id, tx);
    const titulo = item.caption.trim() || 'Conteúdo exclusivo';

    if (existente) {
      await this.offers.update(
        existente.id,
        { title: titulo, priceMinor: item.priceMinor, status: 'ACTIVE' },
        tx,
      );

      return;
    }

    await this.offers.create(
      {
        id: this.ids.next(),
        profileId: item.profileId,
        kind: 'CONTENT_UNLOCK',
        title: titulo,
        description: null,
        priceMinor: item.priceMinor,
        currency: 'AOA',
        // Não há prazo nem revisões: a entrega é imediata e automática.
        slaHours: 1,
        revisionsIncluded: 0,
        requiresBrief: false,
        contentItemId: item.id,
      },
      tx,
    );
  }
}
