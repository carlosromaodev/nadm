import { Injectable } from '@nestjs/common';
import { ResourceNotFoundError } from '@/core/errors/domain-error';
import { TransactionRunner } from '@/shared/application/transaction';
import type { Offer, Profile } from '../../domain/profile';
import { OffersRepository, ProfilesRepository } from '../ports/profiles.repository';

export interface MyProfileView {
  profile: Profile;
  offers: Offer[];
}

/**
 * O perfil de quem está a pedir.
 *
 * Ao contrário de `GetProfileByHandleUseCase`, devolve o perfil mesmo **por
 * publicar** — é o dono a olhar para o seu próprio rascunho, e nesse caso a
 * existência não é segredo nenhum.
 *
 * Quem não tem perfil recebe 404, e é assim que o cliente sabe que este
 * utilizador só compra.
 */
@Injectable()
export class GetMyProfileUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly profiles: ProfilesRepository,
    private readonly offers: OffersRepository,
  ) {}

  async execute(actorUserId: string): Promise<MyProfileView> {
    return this.transactions.run(async (tx) => {
      const profile = await this.profiles.findByUserId(actorUserId, tx);

      if (!profile) {
        throw new ResourceNotFoundError('Profile', actorUserId);
      }

      return { profile, offers: await this.offers.listActiveByProfile(profile.id, tx) };
    });
  }
}
