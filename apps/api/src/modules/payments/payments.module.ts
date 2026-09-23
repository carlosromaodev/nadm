import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '@/core/clock/clock';
import type { Env } from '@/core/config/env';
import { DealsModule } from '@/modules/deals/deals.module';
import { LedgerModule } from '@/modules/ledger/ledger.module';
import { PaymentsGateway } from './application/ports/payments.gateway';
import {
  PaymentEventsRepository,
  PaymentIntentsRepository,
} from './application/ports/payments.repository';
import { HandlePaymentCapturedUseCase } from './application/use-cases/handle-payment-captured.use-case';
import { StartCounterOfferTopUpUseCase } from './application/use-cases/start-counter-offer-top-up.use-case';
import { StartDealPaymentUseCase } from './application/use-cases/start-deal-payment.use-case';
import { DEVELOPMENT_PAYMENTS_ENABLED, GetPaymentStatusUseCase, SimulatePaymentUseCase } from './application/use-cases/payment-status.use-case';
import { PaymentsController } from './http/payments.controller';
import { FakePaymentsGateway } from './infra/fake-payments.gateway';
import {
  PrismaPaymentEventsRepository,
  PrismaPaymentIntentsRepository,
} from './infra/prisma/prisma-payments.repository';

@Module({
  imports: [forwardRef(() => DealsModule), LedgerModule],
  controllers: [PaymentsController],
  providers: [
    { provide: DEVELOPMENT_PAYMENTS_ENABLED, inject: [ConfigService], useFactory: (config: ConfigService<Env, true>) => config.get('NODE_ENV', { infer: true }) !== 'production' && config.get('PAYMENTS_PROVIDER', { infer: true }) === 'fake' },
    GetPaymentStatusUseCase,
    SimulatePaymentUseCase,
    { provide: PaymentIntentsRepository, useClass: PrismaPaymentIntentsRepository },
    { provide: PaymentEventsRepository, useClass: PrismaPaymentEventsRepository },
    {
      // A implementação real do MULTICAIXA Express entra aqui quando DP-04
      // fechar, sem tocar em nenhum caso de uso. Ver docs/plano.md, T-B.
      provide: PaymentsGateway,
      inject: [ConfigService, Clock],
      useFactory: (config: ConfigService<Env, true>, clock: Clock) => {
        const provider = config.get('PAYMENTS_PROVIDER', { infer: true });

        if (provider !== 'fake') {
          throw new Error(
            `PAYMENTS_PROVIDER="${provider}" não tem implementação. DP-04 continua em aberto.`,
          );
        }

        return new FakePaymentsGateway(clock);
      },
    },
    StartDealPaymentUseCase,
    StartCounterOfferTopUpUseCase,
    HandlePaymentCapturedUseCase,
  ],
  exports: [PaymentsGateway, PaymentIntentsRepository],
})
export class PaymentsModule {}
