import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '@/core/config/env';
import { DevSessionPolicy, DevSessionRepository } from './application/ports/dev-session.repository';
import { CreateDevSessionUseCase } from './application/use-cases/create-dev-session.use-case';
import { IdentityVerificationsRepository } from './application/ports/identity-verifications.repository';
import {
  ListMyIdentityVerificationsUseCase,
  ListPendingIdentityVerificationsUseCase,
  ReviewIdentityVerificationUseCase,
  SubmitIdentityVerificationUseCase,
} from './application/use-cases/identity-verification.use-case';
import {
  AdminIdentityVerificationController,
  IdentityVerificationController,
} from './http/identity-verification.controller';
import { PrismaIdentityVerificationsRepository } from './infra/prisma/prisma-identity-verifications.repository';
import { PrismaDevSessionRepository } from './infra/prisma/prisma-dev-session.repository';
import { DevSessionController } from './http/dev-session.controller';
import {
  AccountsRepository,
  UsersRepository,
} from './application/ports/identity.repository';
import {
  PrismaAccountsRepository,
  PrismaUsersRepository,
} from './infra/prisma/prisma-identity.repository';

@Global()
@Module({
  controllers: [DevSessionController, IdentityVerificationController, AdminIdentityVerificationController],
  providers: [
    { provide: UsersRepository, useClass: PrismaUsersRepository },
    { provide: AccountsRepository, useClass: PrismaAccountsRepository },
    { provide: DevSessionRepository, useClass: PrismaDevSessionRepository },
    { provide: DevSessionPolicy, inject: [ConfigService], useFactory: (config: ConfigService<Env, true>) => ({
      isEnabled: () => config.get('NODE_ENV', { infer: true }) !== 'production' && config.get('AUTH_ADAPTER', { infer: true }) === 'dev',
    }) },
    CreateDevSessionUseCase,
    { provide: IdentityVerificationsRepository, useClass: PrismaIdentityVerificationsRepository },
    SubmitIdentityVerificationUseCase,
    ReviewIdentityVerificationUseCase,
    ListMyIdentityVerificationsUseCase,
    ListPendingIdentityVerificationsUseCase,
  ],
  exports: [UsersRepository, AccountsRepository, IdentityVerificationsRepository],
})
export class IdentityModule {}
