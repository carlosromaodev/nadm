import { Injectable } from '@nestjs/common';
import { BusinessRuleError, ResourceNotFoundError } from '@/core/errors/domain-error';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { TransactionRunner } from '@/shared/application/transaction';
import { ProfilesRepository, type UpdateProfileInput } from '../ports/profiles.repository';

@Injectable()
export class UpdateProfileUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly profiles: ProfilesRepository,
    private readonly audit: AuditLogRepository,
  ) {}

  async execute(actorUserId: string, input: UpdateProfileInput) {
    if (input.displayName !== undefined && input.displayName.trim().length < 2) {
      throw new BusinessRuleError('O nome deve ter pelo menos 2 caracteres.');
    }
    if (input.settings?.agenda && input.settings.agenda.startTime >= input.settings.agenda.endTime) {
      throw new BusinessRuleError('A hora de fim deve ser posterior à hora de início.');
    }
    return this.transactions.run(async (tx) => {
      const profile = await this.profiles.findByUserId(actorUserId, tx);
      if (!profile) throw new ResourceNotFoundError('Profile', actorUserId);
      const updated = await this.profiles.update(profile.id, {
        ...input,
        ...(input.displayName === undefined ? {} : { displayName: input.displayName.trim() }),
        ...(input.bio === undefined ? {} : { bio: input.bio?.trim() || null }),
        ...(input.settings ? { settings: { ...profile.settings, ...input.settings } } : {}),
      }, tx);
      await this.audit.record({ actorUserId, actorKind: 'USER', action: 'profile.updated', subjectType: 'Profile', subjectId: profile.id,
        metadata: { fields: Object.keys(input) } }, tx);
      return updated;
    });
  }
}
