import { BusinessRuleError } from '@/core/errors/domain-error';

export type ContentKind = 'PHOTO' | 'VIDEO' | 'ALBUM' | 'PLAYLIST';
export type ContentVisibility = 'PUBLIC' | 'PAID' | 'MEMBERS';
export type ContentStatus = 'DRAFT' | 'PUBLISHED' | 'SCHEDULED';
export type MediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'video/mp4' | 'video/webm';

export interface StoredMedia {
  id: string;
  ownerUserId: string;
  storageKey: string;
  mimeType: MediaType;
  byteSize: number;
  createdAt: Date;
}

export interface ContentItem {
  id: string;
  profileId: string;
  kind: ContentKind;
  caption: string;
  visibility: ContentVisibility;
  priceMinor: bigint;
  currency: 'AOA';
  mediaIds: string[];
  previewMediaIds: string[];
  folder: string | null;
  status: ContentStatus;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentGrant {
  id: string;
  contentId: string;
  userId: string;
  source: 'OWNER' | 'PURCHASE' | 'MEMBERSHIP';
  grantedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export function isVisibleContent(item: ContentItem, now: Date): boolean {
  if (item.deletedAt !== null) return false;
  return item.status === 'PUBLISHED' || (item.status === 'SCHEDULED' && item.scheduledAt !== null && item.scheduledAt.getTime() <= now.getTime());
}

export function isActiveGrant(grant: ContentGrant | null, now: Date): boolean {
  return grant !== null && grant.revokedAt === null && grant.grantedAt.getTime() <= now.getTime()
    && (grant.expiresAt === null || grant.expiresAt.getTime() > now.getTime());
}

export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

/** Rejeita SVG/HTML e MIME enganoso; não substitui transcode/antivírus de produção. */
export function validateMediaBytes(mimeType: MediaType, bytes: Uint8Array): void {
  if (bytes.length === 0 || bytes.length > MAX_MEDIA_BYTES) throw new BusinessRuleError('O ficheiro deve ter entre 1 byte e 10 MB.');
  const matches = (offset: number, expected: number[]) => expected.every((byte, index) => bytes[offset + index] === byte);
  const ascii = (offset: number, value: string) => matches(offset, [...value].map((character) => character.charCodeAt(0)));
  let valid = false;
  switch (mimeType) {
    case 'image/jpeg': valid = bytes.length >= 4 && matches(0, [0xff, 0xd8, 0xff]) && matches(bytes.length - 2, [0xff, 0xd9]); break;
    case 'image/png': valid = bytes.length >= 24 && matches(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) && ascii(12, 'IHDR'); break;
    case 'image/webp': valid = bytes.length >= 16 && ascii(0, 'RIFF') && ascii(8, 'WEBP') && ascii(12, 'VP8'); break;
    case 'video/mp4': valid = bytes.length >= 16 && ascii(4, 'ftyp'); break;
    case 'video/webm': valid = bytes.length >= 8 && matches(0, [0x1a, 0x45, 0xdf, 0xa3]); break;
  }
  if (!valid) throw new BusinessRuleError('O formato do ficheiro não corresponde ao tipo indicado. Usa JPEG, PNG, WebP, MP4 ou WebM.');
}
