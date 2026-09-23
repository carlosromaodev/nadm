import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { TransactionRunner, type TxContext } from '@/shared/application/transaction';
import { PrismaService } from './prisma.service';

/** O que o contexto opaco de transacção tem lá dentro, visível só à infra. */
interface PrismaTxContext extends TxContext {
  client: Prisma.TransactionClient;
}

/**
 * Resolve o cliente a usar: o da transacção em curso, ou o cliente base quando
 * a chamada não está dentro de nenhuma.
 */
export function clientFrom(
  prisma: PrismaService,
  tx?: TxContext,
): Prisma.TransactionClient {
  return (tx as PrismaTxContext | undefined)?.client ?? prisma;
}

@Injectable()
export class PrismaTransactionRunner extends TransactionRunner {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  run<T>(work: (tx: TxContext) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((client) => work({ client } satisfies PrismaTxContext));
  }
}
