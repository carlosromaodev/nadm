import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '@/core/config/env';
import { ContentModule } from '@/modules/content/content.module';
import { LedgerModule } from '@/modules/ledger/ledger.module';
import { PaymentsModule } from '@/modules/payments/payments.module';
import { ProfilesModule } from '@/modules/profiles/profiles.module';
import {
  DeliveriesRepository,
  MessagesRepository,
} from './application/ports/conversation.repository';
import { CounterOffersRepository } from './application/ports/counter-offers.repository';
import { DealReferenceGenerator, DealsRepository } from './application/ports/deals.repository';
import { DisputesRepository } from './application/ports/disputes.repository';
import {
  AdminPostMessageUseCase,
  AdminReadConversationUseCase,
} from './application/use-cases/admin-conversation.use-case';
import {
  OpenDisputeUseCase,
  WithdrawDisputeUseCase,
} from './application/use-cases/open-dispute.use-case';
import {
  ListOpenDisputesUseCase,
  ResolveDisputeUseCase,
} from './application/use-cases/resolve-dispute.use-case';
import { AcceptDealUseCase } from './application/use-cases/accept-deal.use-case';
import { ApproveDeliveryUseCase } from './application/use-cases/approve-delivery.use-case';
import { CounterOfferDealUseCase } from './application/use-cases/counter-offer-deal.use-case';
import { CreateDealUseCase } from './application/use-cases/create-deal.use-case';
import { DeclineDealUseCase } from './application/use-cases/decline-deal.use-case';
import { EscrowRefundService } from './application/use-cases/escrow-refund';
import { EscrowReleaseService } from './application/use-cases/escrow-release';
import { FulfilContentUnlockUseCase } from './application/use-cases/fulfil-content-unlock.use-case';
import { SlotReleaseService } from './application/use-cases/slot-release';
import { GetDealUseCase, ListDealsUseCase } from './application/use-cases/get-deal.use-case';
import { ListMessagesUseCase } from './application/use-cases/list-messages.use-case';
import { RejectDeliveryUseCase } from './application/use-cases/reject-delivery.use-case';
import { RequestRefundUseCase } from './application/use-cases/request-refund.use-case';
import { RespondCounterOfferUseCase } from './application/use-cases/respond-counter-offer.use-case';
import { RunDealDeadlinesUseCase } from './application/use-cases/run-deal-deadlines.use-case';
import { SendMessageUseCase } from './application/use-cases/send-message.use-case';
import { SubmitDeliveryUseCase } from './application/use-cases/submit-delivery.use-case';
import { DealsController } from './http/deals.controller';
import { AdminDisputesController, DisputesController } from './http/disputes.controller';
import {
  DEADLINE_SWEEP_INTERVAL_MS,
  DealDeadlinesScheduler,
} from './infra/deal-deadlines.scheduler';
import {
  PrismaDeliveriesRepository,
  PrismaMessagesRepository,
} from './infra/prisma/prisma-conversation.repository';
import { PrismaCounterOffersRepository } from './infra/prisma/prisma-counter-offers.repository';
import {
  PrismaDealReferenceGenerator,
  PrismaDealsRepository,
} from './infra/prisma/prisma-deals.repository';
import { PrismaDisputesRepository } from './infra/prisma/prisma-disputes.repository';

@Module({
  imports: [
    ProfilesModule,
    LedgerModule,
    // UC-09: a captura de um pagamento de conteúdo desbloqueia-o na mesma
    // transacção. A dependência vai só neste sentido — o conteúdo não conhece
    // os `Deal`.
    ContentModule,
    // Recusar ou expirar um pedido por pagar fecha a intenção de pagamento que
    // ficou viva. É a única coisa que os deals precisam dos pagamentos, e é o
    // que torna as duas importações mútuas.
    forwardRef(() => PaymentsModule),
  ],
  controllers: [DealsController, DisputesController, AdminDisputesController],
  providers: [
    { provide: DealsRepository, useClass: PrismaDealsRepository },
    { provide: DealReferenceGenerator, useClass: PrismaDealReferenceGenerator },
    { provide: MessagesRepository, useClass: PrismaMessagesRepository },
    { provide: DeliveriesRepository, useClass: PrismaDeliveriesRepository },
    { provide: DisputesRepository, useClass: PrismaDisputesRepository },
    { provide: CounterOffersRepository, useClass: PrismaCounterOffersRepository },
    EscrowRefundService,
    EscrowReleaseService,
    FulfilContentUnlockUseCase,
    SlotReleaseService,
    CreateDealUseCase,
    AcceptDealUseCase,
    DeclineDealUseCase,
    CounterOfferDealUseCase,
    RespondCounterOfferUseCase,
    SubmitDeliveryUseCase,
    ApproveDeliveryUseCase,
    RejectDeliveryUseCase,
    RequestRefundUseCase,
    RunDealDeadlinesUseCase,
    SendMessageUseCase,
    ListMessagesUseCase,
    GetDealUseCase,
    ListDealsUseCase,
    OpenDisputeUseCase,
    WithdrawDisputeUseCase,
    ResolveDisputeUseCase,
    ListOpenDisputesUseCase,
    AdminReadConversationUseCase,
    AdminPostMessageUseCase,
    {
      provide: DEADLINE_SWEEP_INTERVAL_MS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        config.get('DEAL_DEADLINE_SWEEP_MS', { infer: true }),
    },
    DealDeadlinesScheduler,
  ],
  exports: [
    DealsRepository,
    MessagesRepository,
    CounterOffersRepository,
    DisputesRepository,
    EscrowReleaseService,
    // A captura de um pagamento de conteúdo desbloqueia-o; quem a recebe é o
    // módulo dos pagamentos.
    FulfilContentUnlockUseCase,
    RunDealDeadlinesUseCase,
  ],
})
export class DealsModule {}
