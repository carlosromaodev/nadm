import { Injectable } from '@nestjs/common';
import { ResourceNotFoundError } from '@/core/errors/domain-error';
import { TransactionRunner } from '@/shared/application/transaction';
import { OffersRepository, ProfilesRepository } from '../ports/profiles.repository';

@Injectable()
export class ListMyOffersUseCase {
  constructor(private readonly transactions: TransactionRunner, private readonly profiles: ProfilesRepository, private readonly offers: OffersRepository) {}

  async execute(actorUserId: string) {
    return this.transactions.run(async (tx) => {
      const profile = await this.profiles.findByUserId(actorUserId, tx);
      if (!profile) throw new ResourceNotFoundError('Profile', actorUserId);
      return this.offers.listByProfile(profile.id, tx);
    });
  }
}
