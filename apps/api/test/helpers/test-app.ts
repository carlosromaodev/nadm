import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/core/database/prisma.service';
import { DomainExceptionFilter } from '@/core/http/domain-exception.filter';

export interface TestApp {
  app: INestApplication;
  prisma: PrismaClient;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication({ rawBody: true });

  app.setGlobalPrefix('api');
  app.useGlobalFilters(new DomainExceptionFilter());

  await app.init();

  const prisma = app.get(PrismaService);

  return {
    app,
    prisma,
    close: async () => {
      await app.close();
      await closeOwnerPrisma();
    },
  };
}

let ownerClient: PrismaClient | null = null;

/**
 * O cliente do papel dono, partilhado por toda a bateria.
 *
 * **Um só, e não um por chamada.** Cada `PrismaClient` abre o seu pool, e o
 * Postgres tem `max_connections`: abrir e fechar um por cada limpeza entre
 * testes esgota o limite a meio da corrida e faz falhar um `beforeEach`
 * qualquer, que é a pior maneira de falhar — a bateria passa a estar certa ou
 * errada conforme o dia.
 */
export function ownerPrisma(): PrismaClient {
  ownerClient ??= new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_DATABASE_URL } },
  });

  return ownerClient;
}

/** Fecha o cliente do dono. Chamado uma vez, no fim de cada ficheiro. */
export async function closeOwnerPrisma(): Promise<void> {
  await ownerClient?.$disconnect();
  ownerClient = null;
}

/**
 * Limpa as tabelas entre testes.
 *
 * A lista é **explícita e completa** de propósito. Deixar tabelas de fora e
 * contar com o `CASCADE` funciona até alguém acrescentar uma que não referencie
 * nenhuma das listadas — e aí os testes passam a falhar de vez em quando, que é
 * a pior maneira de falhar.
 *
 * Usa o papel dono: o papel da aplicação não tem DELETE no razão nem na
 * auditoria, e é exactamente isso que se quer que ele não tenha. Limpar dados
 * de teste é trabalho de migração, não de aplicação.
 */
export async function resetDatabase(): Promise<void> {
  const owner = ownerPrisma();

  await owner.$executeRawUnsafe(`
      TRUNCATE TABLE
        ledger_entries, ledger_transactions, wallets,
        payment_events, payment_intents, idempotency_keys,
        payouts, identity_verifications,
        direct_messages, direct_conversations,
        deal_counter_offers, deliveries, messages, deals,
        reviews, content_grants, content_items, media,
        offers, profiles,
        audit_logs, outbox_events,
        accounts, users
      RESTART IDENTITY CASCADE
    `);

  await owner.$executeRawUnsafe(`ALTER SEQUENCE deal_reference_seq RESTART WITH 1`);
}
