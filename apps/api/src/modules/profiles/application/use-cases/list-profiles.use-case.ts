import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '@/shared/application/transaction';
import { OffersRepository, ProfilesRepository } from '../ports/profiles.repository';

@Injectable()
export class ListProfilesUseCase {
  constructor(private readonly transactions: TransactionRunner, private readonly profiles: ProfilesRepository, private readonly offers: OffersRepository) {}

  async execute(query = '') {
    return this.transactions.run(async (tx) => {
      const profiles = await this.profiles.listPublished(query.trim().slice(0, 80), tx);
      return Promise.all(profiles.map(async (profile) => ({ profile, offers: await this.offers.listActiveByProfile(profile.id, tx) })));
    });
  }
}
