import { Module } from '@nestjs/common';
import { AvailabilityRepository } from './application/ports/availability.repository';
import { OffersRepository, ProfilesRepository } from './application/ports/profiles.repository';
import {
  CreateAvailabilityWindowUseCase,
  DeleteAvailabilityWindowUseCase,
  ListMyWindowsUseCase,
  ListOfferWindowsUseCase,
} from './application/use-cases/availability.use-case';
import { CreateOfferUseCase } from './application/use-cases/create-offer.use-case';
import { CreateProfileUseCase } from './application/use-cases/create-profile.use-case';
import { GetMyProfileUseCase } from './application/use-cases/get-my-profile.use-case';
import { GetProfileByHandleUseCase } from './application/use-cases/get-profile-by-handle.use-case';
import { ProfilesController } from './http/profiles.controller';
import { ListProfilesUseCase } from './application/use-cases/list-profiles.use-case';
import { ListMyOffersUseCase } from './application/use-cases/list-my-offers.use-case';
import { UpdateProfileUseCase } from './application/use-cases/update-profile.use-case';
import { UpdateOfferUseCase } from './application/use-cases/update-offer.use-case';
import { PrismaAvailabilityRepository } from './infra/prisma/prisma-availability.repository';
import {
  PrismaOffersRepository,
  PrismaProfilesRepository,
} from './infra/prisma/prisma-profiles.repository';
import { AvailabilityController } from './http/availability.controller';

@Module({
  controllers: [ProfilesController, AvailabilityController],
  providers: [
    { provide: ProfilesRepository, useClass: PrismaProfilesRepository },
    { provide: OffersRepository, useClass: PrismaOffersRepository },
    { provide: AvailabilityRepository, useClass: PrismaAvailabilityRepository },
    CreateProfileUseCase,
    CreateOfferUseCase,
    GetProfileByHandleUseCase,
    GetMyProfileUseCase,
    ListProfilesUseCase,
    ListMyOffersUseCase,
    UpdateProfileUseCase,
    UpdateOfferUseCase,
    CreateAvailabilityWindowUseCase,
    ListOfferWindowsUseCase,
    ListMyWindowsUseCase,
    DeleteAvailabilityWindowUseCase,
  ],
  exports: [ProfilesRepository, OffersRepository, AvailabilityRepository],
})
export class ProfilesModule {}
