import { Injectable } from '@nestjs/common';
import { ResourceNotFoundError } from '@/core/errors/domain-error';
import { ProfilesRepository } from '@/modules/profiles/application/ports/profiles.repository';
import type { Payout, PayoutStatus } from '../../domain/payout';
import { PayoutsRepository } from '../ports/payouts.repository';

/** Os levantamentos do próprio criador, e mais nenhuns. */
@Injectable()
export class ListMyPayoutsUseCase {
  constructor(
    private readonly payouts: PayoutsRepository,
    private readonly profiles: ProfilesRepository,
  ) {}

  async execute(input: { actorUserId: string; limit?: number }): Promise<Payout[]> {
    const profile = await this.profiles.findByUserId(input.actorUserId);

    if (!profile) {
      throw new ResourceNotFoundError('Profile', input.actorUserId);
    }

    return this.payouts.list({ profileId: profile.id, limit: input.limit ?? 50 });
  }
}

/** A fila da administração. Filtra por estado, nunca por criador. */
@Injectable()
export class ListPayoutQueueUseCase {
  constructor(private readonly payouts: PayoutsRepository) {}

  execute(input: { status?: PayoutStatus; limit?: number } = {}): Promise<Payout[]> {
    return this.payouts.list({ status: input.status ?? 'REQUESTED', limit: input.limit ?? 50 });
  }
}
