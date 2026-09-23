import { Module } from '@nestjs/common';
import { ProfilesModule } from '@/modules/profiles/profiles.module';
import { LedgerRepository, WalletsRepository } from './application/ports/ledger.repository';
import { GetWalletUseCase } from './application/use-cases/get-wallet.use-case';
import { WalletController } from './http/wallet.controller';
import {
  PrismaLedgerRepository,
  PrismaWalletsRepository,
} from './infra/prisma/prisma-ledger.repository';

@Module({
  imports: [ProfilesModule],
  controllers: [WalletController],
  providers: [
    { provide: LedgerRepository, useClass: PrismaLedgerRepository },
    { provide: WalletsRepository, useClass: PrismaWalletsRepository },
    GetWalletUseCase,
  ],
  exports: [LedgerRepository, WalletsRepository],
})
export class LedgerModule {}
