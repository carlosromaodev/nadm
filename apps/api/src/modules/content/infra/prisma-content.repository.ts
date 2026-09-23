import { Injectable } from '@nestjs/common';
import type { ContentItem as ContentRow, ContentGrant as GrantRow, Media as MediaRow } from '@prisma/client';
import { clientFrom } from '@/core/database/prisma-transaction';
import { PrismaService } from '@/core/database/prisma.service';
import type { TxContext } from '@/shared/application/transaction';
import { ContentRepository } from '../application/ports/content.repository';
import type { ContentItem, ContentGrant, StoredMedia } from '../domain/content';

function itemFrom(row: ContentRow): ContentItem {
  return { ...row, kind: row.kind as ContentItem['kind'], visibility: row.visibility as ContentItem['visibility'],
    status: row.status as ContentItem['status'], currency: 'AOA' };
}
function grantFrom(row: GrantRow): ContentGrant { return { ...row, source: row.source as ContentGrant['source'] }; }
function mediaFrom(row: MediaRow): StoredMedia { return { ...row, mimeType: row.mimeType as StoredMedia['mimeType'] }; }

@Injectable()
export class PrismaContentRepository extends ContentRepository {
  constructor(private readonly prisma: PrismaService) { super(); }
  async createMedia(media: StoredMedia, tx: TxContext) {
    await clientFrom(this.prisma, tx).media.create({ data: media });
  }
  async findMedia(id: string, tx?: TxContext) {
    const row = await clientFrom(this.prisma, tx).media.findUnique({ where: { id } });
    return row ? mediaFrom(row) : null;
  }
  async findItem(id: string, tx?: TxContext) {
    const row = await clientFrom(this.prisma, tx).contentItem.findUnique({ where: { id } });
    return row ? itemFrom(row) : null;
  }
  async listItems(profileId: string, tx?: TxContext) {
    const rows = await clientFrom(this.prisma, tx).contentItem.findMany({ where: { profileId, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 100 });
    return rows.map(itemFrom);
  }
  async saveItem(item: ContentItem, creating: boolean, tx: TxContext) {
    const client = clientFrom(this.prisma, tx);
    const row = creating ? await client.contentItem.create({ data: item })
      : await client.contentItem.update({ where: { id: item.id }, data: item });
    return itemFrom(row);
  }
  async findGrant(contentId: string, userId: string, tx?: TxContext) {
    const row = await clientFrom(this.prisma, tx).contentGrant.findUnique({ where: { contentId_userId: { contentId, userId } } });
    return row ? grantFrom(row) : null;
  }
  async createGrant(grant: ContentGrant, tx: TxContext) {
    await clientFrom(this.prisma, tx).contentGrant.create({ data: grant });
  }
}
