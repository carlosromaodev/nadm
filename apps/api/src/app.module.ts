import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { DevAuthGuard } from './core/auth/dev-auth.guard';
import { RolesGuard } from './core/auth/roles.guard';
import { ClockModule } from './core/clock/clock.module';
import { validateEnv } from './core/config/env';
import { PrismaModule } from './core/database/prisma.module';
import { ContentModule } from './modules/content/content.module';
import { DealsModule } from './modules/deals/deals.module';
import { IdentityModule } from './modules/identity/identity.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OpsModule } from './modules/ops/ops.module';
import { PayoutsModule } from './modules/payouts/payouts.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { SharedModule } from './shared/shared.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { HealthController } from './core/http/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    ClockModule,
    SharedModule,
    IdentityModule,
    ProfilesModule,
    LedgerModule,
    DealsModule,
    ContentModule,
    PaymentsModule,
    PayoutsModule,
    ReviewsModule,
    OpsModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Autenticação exigida por omissão: uma rota sem @Public() fica fechada.
    { provide: APP_GUARD, useClass: DevAuthGuard },
    // Corre depois da autenticação e só morde nas rotas com @Roles().
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
