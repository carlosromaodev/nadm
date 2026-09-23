import { Injectable } from '@nestjs/common';
import { ResourceNotFoundError } from '@/core/errors/domain-error';
import { TransactionRunner } from '@/shared/application/transaction';
import { Clock } from '@/core/clock/clock';
import { derivedAvailability, type AvailabilityWindow } from '../../domain/availability';
import {
  isPublished,
  type AvailabilityStatus,
  type Offer,
  type Profile,
} from '../../domain/profile';
import { AvailabilityRepository } from '../ports/availability.repository';
import { OffersRepository, ProfilesRepository } from '../ports/profiles.repository';

export interface PublicProfileView {
  profile: Profile;
  offers: Offer[];
  /**
   * O estado que se mostra, recalculado a cada leitura.
   *
   * Não é o que está guardado: `NO_SLOTS` deriva das janelas e `PAUSED` tem
   * precedência. Guardar o derivado criaria uma segunda verdade sobre a mesma
   * coisa, e as duas haviam de divergir.
   */
  availability: AvailabilityStatus;
  /** As vagas por acontecer, para o comprador escolher antes de contratar. */
  windows: AvailabilityWindow[];
}

@Injectable()
export class GetProfileByHandleUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly profiles: ProfilesRepository,
    private readonly offers: OffersRepository,
    private readonly availability: AvailabilityRepository,
    private readonly clock: Clock,
  ) {}

  async execute(handle: string): Promise<PublicProfileView> {
    return this.transactions.run(async (tx) => {
      const profile = await this.profiles.findByHandle(handle, tx);

      // Um perfil por publicar é indistinguível de um perfil inexistente para
      // quem não é o dono.
      if (!profile || !isPublished(profile)) {
        throw new ResourceNotFoundError('Profile', handle);
      }

      const now = this.clock.now();

      return {
        profile,
        offers: await this.offers.listActiveByProfile(profile.id, tx),
        availability: derivedAvailability(
          profile,
          await this.availability.hasBookableSlots(profile.id, now, tx),
        ),
        windows: await this.availability.listUpcomingByProfile(profile.id, now, tx),
      };
    });
  }
}
