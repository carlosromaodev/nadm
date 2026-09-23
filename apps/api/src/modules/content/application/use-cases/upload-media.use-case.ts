import { Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { BusinessRuleError, ResourceNotFoundError } from '@/core/errors/domain-error';
import { UsersRepository } from '@/modules/identity/application/ports/identity.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { TransactionRunner } from '@/shared/application/transaction';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { ContentRepository, MediaUrlSigner, PrivateMediaStorage } from '../ports/content.repository';
import { MAX_MEDIA_BYTES, validateMediaBytes, type MediaType } from '../../domain/content';

@Injectable()
export class UploadMediaUseCase {
  constructor(private readonly transactions: TransactionRunner, private readonly contents: ContentRepository,
    private readonly users: UsersRepository, private readonly storage: PrivateMediaStorage, private readonly signer: MediaUrlSigner,
    private readonly clock: Clock, private readonly ids: IdGenerator, private readonly audit: AuditLogRepository) {}

  async execute(actorUserId: string, input: { mimeType: MediaType; base64: string }) {
    const user = await this.users.findById(actorUserId);
    if (user?.status !== 'ACTIVE') throw new ResourceNotFoundError('User', actorUserId);
    if (input.base64.length > Math.ceil(MAX_MEDIA_BYTES / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.base64)) {
      throw new BusinessRuleError('O ficheiro está inválido ou excede 10 MB.');
    }
    const bytes = Buffer.from(input.base64, 'base64');
    validateMediaBytes(input.mimeType, bytes);
    const now = this.clock.now();
    const media = { id: this.ids.next(), ownerUserId: actorUserId, storageKey: this.ids.next(), mimeType: input.mimeType, byteSize: bytes.length, createdAt: now };
    await this.storage.write(media.storageKey, bytes);
    try {
      await this.transactions.run(async (tx) => {
        await this.contents.createMedia(media, tx);
        await this.audit.record({ actorUserId, actorKind: 'USER', action: 'media.uploaded', subjectType: 'Media', subjectId: media.id,
          metadata: { mimeType: media.mimeType, byteSize: media.byteSize } }, tx);
      });
    } catch (error) {
      await this.storage.remove(media.storageKey);
      throw error;
    }
    return { id: media.id, mimeType: media.mimeType,
      url: await this.signer.sign({ mediaId: media.id, actorUserId, contentId: null, expiresAt: now.getTime() + 5 * 60 * 1000 }) };
  }
}
