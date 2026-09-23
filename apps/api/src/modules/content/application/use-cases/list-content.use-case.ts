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
export class ListContentUseCase {
  constructor(private readonly transactions: TransactionRunner, private readonly contents: ContentRepository,
    private readonly profiles: ProfilesRepository, private readonly access: ContentAccess, private readonly clock: Clock) {}

  async execute(input: { ownUserId: string } | { handle: string; actorUserId?: string }) {
    const actorUserId = await this.access.actor('ownUserId' in input ? input.ownUserId : input.actorUserId);
    return this.transactions.run(async (tx) => {
      const profile = 'ownUserId' in input ? await this.profiles.findByUserId(input.ownUserId, tx) : await this.profiles.findByHandle(input.handle, tx);
      const owner = profile?.userId === actorUserId;
      if (!profile || ('ownUserId' in input && !owner) || (!owner && !isPublished(profile))) throw new ResourceNotFoundError('Profile', 'unavailable');
      const all = await this.contents.listItems(profile.id, tx);
      const items = all.filter((item) => item.deletedAt === null && (owner || isVisibleContent(item, this.clock.now())));
      return { items: await Promise.all(items.map((item) => this.access.view(item, actorUserId, owner, tx))) };
    });
  }
}
