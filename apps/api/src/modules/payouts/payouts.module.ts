import { Module } from '@nestjs/common';
import { IdentityModule } from '@/modules/identity/identity.module';
import { LedgerModule } from '@/modules/ledger/ledger.module';
import { ProfilesModule } from '@/modules/profiles/profiles.module';
import { PayoutsRepository } from './application/ports/payouts.repository';
import {
  ListMyPayoutsUseCase,
  ListPayoutQueueUseCase,
} from './application/use-cases/list-payouts.use-case';
import {
  AdminPayoutUseCase,
  CancelPayoutUseCase,
} from './application/use-cases/manage-payout.use-case';
import { PayoutLedgerService } from './application/use-cases/payout-ledger';
import { RequestPayoutUseCase } from './application/use-cases/request-payout.use-case';
import { AdminPayoutsController, PayoutsController } from './http/payouts.controller';
import { PrismaPayoutsRepository } from './infra/prisma/prisma-payouts.repository';

@Module({
  imports: [ProfilesModule, LedgerModule, IdentityModule],
  controllers: [PayoutsController, AdminPayoutsController],
  providers: [
    { provide: PayoutsRepository, useClass: PrismaPayoutsRepository },
    PayoutLedgerService,
    RequestPayoutUseCase,
    CancelPayoutUseCase,
    AdminPayoutUseCase,
    ListMyPayoutsUseCase,
    ListPayoutQueueUseCase,
  ],
})
export class PayoutsModule {}
