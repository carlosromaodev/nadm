import { Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { ResourceNotFoundError } from '@/core/errors/domain-error';
import { ProfilesRepository } from '@/modules/profiles/application/ports/profiles.repository';
import { isPublished } from '@/modules/profiles/domain/profile';
import { TransactionRunner } from '@/shared/application/transaction';
import { isVisibleContent } from '../../domain/content';
import { ContentAccess } from '../content-access';
import { ContentRepository } from '../ports/content.repository';

@Injectable()
export class GetContentUseCase {
  constructor(private readonly transactions: TransactionRunner, private readonly contents: ContentRepository,
    private readonly profiles: ProfilesRepository, private readonly access: ContentAccess, private readonly clock: Clock) {}

  async execute(input: { handle: string; id: string; actorUserId?: string }) {
    const actorUserId = await this.access.actor(input.actorUserId);
    return this.transactions.run(async (tx) => {
      const profile = await this.profiles.findByHandle(input.handle, tx);
      const item = await this.contents.findItem(input.id, tx);
      const owner = profile?.userId === actorUserId;
      if (!profile || !item || item.profileId !== profile.id || item.deletedAt !== null
        || (!owner && (!isPublished(profile) || !isVisibleContent(item, this.clock.now())))) throw new ResourceNotFoundError('Content', input.id);
      return this.access.view(item, actorUserId, owner, tx);
    });
  }
}
