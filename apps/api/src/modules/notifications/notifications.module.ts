import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '@/core/clock/clock';
import type { Env } from '@/core/config/env';
import { DealsModule } from '@/modules/deals/deals.module';
import { IdentityModule } from '@/modules/identity/identity.module';
import { ProfilesModule } from '@/modules/profiles/profiles.module';
import { NotificationChannel } from './application/ports/notification-channel';
import { DeliveriesLog, OutboxQueue } from './application/ports/notifications.repository';
import { DispatchOutboxUseCase } from './application/use-cases/dispatch-outbox.use-case';
import { NotificationPlanner } from './application/use-cases/notification-planner';
import {
  AdminNotificationsController,
  NotificationsController,
} from './http/notifications.controller';
import { FakeNotificationChannel } from './infra/fake-notification.channel';
import { OUTBOX_INTERVAL_MS, OutboxScheduler } from './infra/outbox.scheduler';
import {
  PrismaDeliveriesLog,
  PrismaOutboxQueue,
} from './infra/prisma/prisma-notifications.repository';

@Module({
  imports: [DealsModule, ProfilesModule, IdentityModule],
  controllers: [NotificationsController, AdminNotificationsController],
  providers: [
    { provide: OutboxQueue, useClass: PrismaOutboxQueue },
    { provide: DeliveriesLog, useClass: PrismaDeliveriesLog },
    {
      // As implementações reais de push, SMS e e-mail entram aqui quando DP-03
      // fechar, sem tocar no planeador nem no trabalhador. Ver docs/plano.md, F9.
      provide: NotificationChannel,
      inject: [ConfigService, Clock],
      useFactory: (config: ConfigService<Env, true>, clock: Clock) => {
        const provider = config.get('NOTIFICATIONS_PROVIDER', { infer: true });

        if (provider !== 'fake') {
          throw new Error(
            `NOTIFICATIONS_PROVIDER="${provider}" não tem implementação. DP-03 continua em aberto.`,
          );
        }

        return new FakeNotificationChannel(clock);
      },
    },
    NotificationPlanner,
    DispatchOutboxUseCase,
    {
      provide: OUTBOX_INTERVAL_MS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        config.get('OUTBOX_SWEEP_MS', { infer: true }),
    },
    OutboxScheduler,
  ],
  exports: [NotificationChannel, DispatchOutboxUseCase],
})
export class NotificationsModule {}
