import { Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { UsersRepository } from '@/modules/identity/application/ports/identity.repository';
import { OffersRepository } from '@/modules/profiles/application/ports/profiles.repository';
import { ContentRepository, MediaUrlSigner } from './ports/content.repository';
import { isActiveGrant, type ContentItem } from '../domain/content';
import type { TxContext } from '@/shared/application/transaction';

export interface ContentView {
  id: string;
  kind: ContentItem['kind'];
  caption: string;
  visibility: ContentItem['visibility'];
  price: { amount: string; currency: string } | null;
  publishedAt: string;
  coverUrl: string | null;
  access: 'GRANTED' | 'LOCKED';
  /**
   * A oferta que desbloqueia esta publicação, quando é paga e ainda não foi
   * comprada. É o que o comprador precisa para criar o pedido — sem isto, o
   * botão de desbloquear não sabe o que contratar.
   */
  unlockOfferId: string | null;
  media: { id: string; mimeType: string; url: string }[];
  status?: ContentItem['status'];
  scheduledAt?: string | null;
  folder?: string | null;
  mediaIds?: string[];
  previewMediaIds?: string[];
}

@Injectable()
export class ContentAccess {
  constructor(private readonly contents: ContentRepository, private readonly users: UsersRepository,
    private readonly offers: OffersRepository, private readonly signer: MediaUrlSigner,
    private readonly clock: Clock) {}

  async actor(rawUserId?: string): Promise<string | null> {
    if (!rawUserId || !/^[a-f0-9-]{36}$/i.test(rawUserId)) return null;
    const user = await this.users.findById(rawUserId);
    return user?.status === 'ACTIVE' ? user.id : null;
  }

  async hasGrant(item: ContentItem, userId: string | null, tx?: TxContext) {
    return userId !== null && isActiveGrant(await this.contents.findGrant(item.id, userId, tx), this.clock.now());
  }

  async view(item: ContentItem, actorUserId: string | null, owner: boolean, tx?: TxContext): Promise<ContentView> {
    const granted = item.visibility === 'PUBLIC' || await this.hasGrant(item, actorUserId, tx);
    const ids = granted ? item.mediaIds : item.previewMediaIds;
    const media = [];
    for (const id of ids) {
      const stored = await this.contents.findMedia(id, tx);
      if (!stored) continue;
      media.push({ id, mimeType: stored.mimeType, url: await this.signer.sign({ mediaId: id, actorUserId,
        contentId: item.id, expiresAt: this.clock.now().getTime() + 5 * 60 * 1000 }) });
    }
    return {
      id: item.id, kind: item.kind, caption: item.caption, visibility: item.visibility,
      price: item.visibility === 'PAID' ? { amount: item.priceMinor.toString(), currency: item.currency } : null,
      publishedAt: (item.publishedAt ?? item.scheduledAt ?? item.createdAt).toISOString(),
      coverUrl: media.find((entry) => entry.mimeType.startsWith('image/'))?.url ?? null,
      access: granted ? 'GRANTED' : 'LOCKED', media,
      // Só faz sentido oferecer o desbloqueio a quem ainda não tem acesso.
      unlockOfferId: granted || item.visibility !== 'PAID' ? null
        : (await this.offers.findByContentItem(item.id, tx))?.id ?? null,
      ...(owner ? { status: item.status, scheduledAt: item.scheduledAt?.toISOString() ?? null, folder: item.folder,
        mediaIds: item.mediaIds, previewMediaIds: item.previewMediaIds } : {}),
    };
  }
}
