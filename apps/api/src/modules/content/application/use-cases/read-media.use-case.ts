import { Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { ResourceNotFoundError } from '@/core/errors/domain-error';
import { ProfilesRepository } from '@/modules/profiles/application/ports/profiles.repository';
import { isPublished } from '@/modules/profiles/domain/profile';
import { isVisibleContent } from '../../domain/content';
import { ContentAccess } from '../content-access';
import { ContentRepository, MediaUrlSigner, PrivateMediaStorage } from '../ports/content.repository';

@Injectable()
export class ReadMediaUseCase {
  constructor(private readonly contents: ContentRepository, private readonly profiles: ProfilesRepository,
    private readonly access: ContentAccess, private readonly signer: MediaUrlSigner, private readonly storage: PrivateMediaStorage, private readonly clock: Clock) {}

  async execute(mediaId: string, token: string) {
    const claims = await this.signer.verify(token);
    const now = this.clock.now();
    if (!claims || claims.mediaId !== mediaId || claims.expiresAt <= now.getTime() || claims.expiresAt > now.getTime() + 15 * 60 * 1000) throw new ResourceNotFoundError('Media', mediaId);
    const media = await this.contents.findMedia(mediaId);
    const actor = claims.actorUserId ? await this.access.actor(claims.actorUserId) : null;
    if (!media || (claims.actorUserId && !actor)) throw new ResourceNotFoundError('Media', mediaId);
    if (!claims.contentId) {
      if (media.ownerUserId !== actor) throw new ResourceNotFoundError('Media', mediaId);
    } else {
      const item = await this.contents.findItem(claims.contentId);
      const profile = item ? await this.profiles.findById(item.profileId) : null;
      const owner = profile?.userId === actor;
      if (!item || !profile || item.deletedAt !== null || media.ownerUserId !== profile.userId || !item.mediaIds.includes(mediaId)
        || (!owner && (!isPublished(profile) || !isVisibleContent(item, now)))) throw new ResourceNotFoundError('Media', mediaId);
      if (item.visibility !== 'PUBLIC' && !await this.access.hasGrant(item, actor) && !item.previewMediaIds.includes(mediaId)) throw new ResourceNotFoundError('Media', mediaId);
    }
    return { bytes: await this.storage.read(media.storageKey), mimeType: media.mimeType, byteSize: media.byteSize };
  }
}
