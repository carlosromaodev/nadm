import type { TxContext } from '@/shared/application/transaction';
import type { ContentGrant, ContentItem, StoredMedia } from '../../domain/content';

export abstract class ContentRepository {
  abstract createMedia(media: StoredMedia, tx: TxContext): Promise<void>;
  abstract findMedia(id: string, tx?: TxContext): Promise<StoredMedia | null>;
  abstract findItem(id: string, tx?: TxContext): Promise<ContentItem | null>;
  abstract listItems(profileId: string, tx?: TxContext): Promise<ContentItem[]>;
  abstract saveItem(item: ContentItem, creating: boolean, tx: TxContext): Promise<ContentItem>;
  abstract findGrant(contentId: string, userId: string, tx?: TxContext): Promise<ContentGrant | null>;
  abstract createGrant(grant: ContentGrant, tx: TxContext): Promise<void>;
}

export abstract class PrivateMediaStorage {
  abstract write(storageKey: string, bytes: Uint8Array): Promise<void>;
  abstract read(storageKey: string): Promise<Uint8Array>;
  abstract remove(storageKey: string): Promise<void>;
}

export interface MediaClaims {
  mediaId: string;
  actorUserId: string | null;
  contentId: string | null;
  expiresAt: number;
}

export abstract class MediaUrlSigner {
  abstract sign(claims: MediaClaims): Promise<string>;
  abstract verify(token: string): Promise<MediaClaims | null>;
}
