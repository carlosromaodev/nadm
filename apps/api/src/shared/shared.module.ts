import { randomUUID } from 'node:crypto';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaTransactionRunner } from '@/core/database/prisma-transaction';
import type { Env } from '@/core/config/env';
import { AuditLogRepository } from './application/ports/audit-log.repository';
import { IdGenerator } from './application/ports/id-generator';
import { OutboxRepository } from './application/ports/outbox.repository';
import { PricingPolicy } from './application/ports/pricing-policy';
import { TransactionRunner } from './application/transaction';
import { PrismaAuditLogRepository, PrismaOutboxRepository } from './infra/prisma-ops.repository';

class UuidGenerator extends IdGenerator {
  next(): string {
    return randomUUID();
  }
}

class ConfiguredPricingPolicy extends PricingPolicy {
  constructor(
    private readonly feeBp: number,
    private readonly minimumPayout: bigint,
  ) {
    super();
  }

  platformFeeBasisPoints(): number {
    return this.feeBp;
  }

  proposalWindowHours(): number {
    return 48;
  }

  approvalWindowHours(): number {
    return 72;
  }

  lateDeliveryGraceHours(): number {
    return 48;
  }

  minimumPayoutMinor(): bigint {
    return this.minimumPayout;
  }
}

@Global()
@Module({
  providers: [
    { provide: TransactionRunner, useClass: PrismaTransactionRunner },
    { provide: IdGenerator, useClass: UuidGenerator },
    { provide: OutboxRepository, useClass: PrismaOutboxRepository },
    { provide: AuditLogRepository, useClass: PrismaAuditLogRepository },
    {
      provide: PricingPolicy,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new ConfiguredPricingPolicy(
          config.get('PLATFORM_FEE_BP', { infer: true }),
          BigInt(config.get('MINIMUM_PAYOUT_MINOR', { infer: true })),
        ),
    },
  ],
  exports: [TransactionRunner, IdGenerator, OutboxRepository, AuditLogRepository, PricingPolicy],
})
export class SharedModule {}
