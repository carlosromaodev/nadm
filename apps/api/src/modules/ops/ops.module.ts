import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '@/core/config/env';
import { IdentityModule } from '@/modules/identity/identity.module';
import { AuditQueries, MetricsQueries } from './application/ports/ops.repository';
import {
  FindingsRepository,
  ReconciliationQueries,
} from './application/ports/reconciliation.repository';
import {
  GetPlatformMetricsUseCase,
  QueryAuditUseCase,
  ReinstateUserUseCase,
  SuspendUserUseCase,
} from './application/use-cases/admin-ops.use-case';
import {
  CloseFindingUseCase,
  ListFindingsUseCase,
} from './application/use-cases/manage-findings.use-case';
import { RunReconciliationUseCase } from './application/use-cases/run-reconciliation.use-case';
import { AdminOpsController } from './http/admin-ops.controller';
import {
  PrismaAuditQueries,
  PrismaMetricsQueries,
} from './infra/prisma/prisma-ops.queries';
import {
  PrismaFindingsRepository,
  PrismaReconciliationQueries,
} from './infra/prisma/prisma-reconciliation.repository';
import {
  RECONCILIATION_INTERVAL_MS,
  ReconciliationScheduler,
} from './infra/reconciliation.scheduler';

@Module({
  imports: [IdentityModule],
  controllers: [AdminOpsController],
  providers: [
    { provide: FindingsRepository, useClass: PrismaFindingsRepository },
    { provide: ReconciliationQueries, useClass: PrismaReconciliationQueries },
    { provide: AuditQueries, useClass: PrismaAuditQueries },
    { provide: MetricsQueries, useClass: PrismaMetricsQueries },
    RunReconciliationUseCase,
    ListFindingsUseCase,
    CloseFindingUseCase,
    SuspendUserUseCase,
    ReinstateUserUseCase,
    QueryAuditUseCase,
    GetPlatformMetricsUseCase,
    {
      provide: RECONCILIATION_INTERVAL_MS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        config.get('RECONCILIATION_SWEEP_MS', { infer: true }),
    },
    ReconciliationScheduler,
  ],
})
export class OpsModule {}
