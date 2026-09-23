import { Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { ResourceConflictError } from '@/core/errors/domain-error';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { TransactionRunner } from '@/shared/application/transaction';
import { Handle } from '@/shared/domain/handle';
import type { Profile } from '../../domain/profile';
import { ProfilesRepository } from '../ports/profiles.repository';

export interface CreateProfileInput {
  actorUserId: string;
  handle: string;
  displayName: string;
  bio?: string | null;
}

/**
 * Criação mínima de perfil, o suficiente para F1 haver alguém a quem comprar.
 *
 * A publicação condicionada por RN-011, a edição e as regras de mudança de
 * handle (RN-010) chegam em F2.
 */
@Injectable()
export class CreateProfileUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly profiles: ProfilesRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: CreateProfileInput): Promise<Profile> {
    const handle = Handle.create(input.handle);
    const now = this.clock.now();

    return this.transactions.run(async (tx) => {
      if (await this.profiles.findByUserId(input.actorUserId, tx)) {
        throw new ResourceConflictError('This user already has a profile');
      }

      if (await this.profiles.findByHandle(handle.value, tx)) {
        throw new ResourceConflictError(`Handle "${handle.value}" is taken`);
      }

      const profile = await this.profiles.create(
        {
          id: this.ids.next(),
          userId: input.actorUserId,
          handle: handle.value,
          displayName: input.displayName.trim(),
          bio: input.bio?.trim() || null,
          publishedAt: now,
        },
        tx,
      );

      await this.auditLog.record(
        {
          actorUserId: input.actorUserId,
          actorKind: 'USER',
          action: 'profile.created',
          subjectType: 'Profile',
          subjectId: profile.id,
          metadata: { handle: profile.handle },
        },
        tx,
      );

      return profile;
    });
  }
}
