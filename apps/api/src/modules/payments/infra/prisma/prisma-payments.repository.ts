import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { clientFrom } from '@/core/database/prisma-transaction';
import { PrismaService } from '@/core/database/prisma.service';
import { ResourceConflictError } from '@/core/errors/domain-error';
import type { TxContext } from '@/shared/application/transaction';
import type {
  PaymentEvent,
  PaymentIntent,
  PaymentIntentStatus,
  PaymentPurpose,
} from '../../domain/payment-intent';
import {
  PaymentEventsRepository,
  PaymentIntentsRepository,
  type CreatePaymentIntentInput,
  type RecordPaymentEventInput,
} from '../../application/ports/payments.repository';

interface IntentRow {
  id: string;
  dealId: string;
  purpose: string;
  counterOfferId: string | null;
  provider: string;
  providerReference: string;
  idempotencyKey: string;
  amountMinor: bigint;
  currency: string;
  status: string;
  payerPhone: string;
  expiresAt: Date;
  capturedAt: Date | null;
}

function toIntent(row: IntentRow): PaymentIntent {
  return {
    ...row,
    currency: row.currency.trim(),
    status: row.status as PaymentIntentStatus,
    purpose: row.purpose as PaymentPurpose,
  };
}

@Injectable()
export class PrismaPaymentIntentsRepository extends PaymentIntentsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string, tx?: TxContext): Promise<PaymentIntent | null> {
    const row = await clientFrom(this.prisma, tx).paymentIntent.findUnique({ where: { id } });
    return row ? toIntent(row) : null;
  }

  async findByProviderReference(
    providerReference: string,
    tx?: TxContext,
  ): Promise<PaymentIntent | null> {
    const row = await clientFrom(this.prisma, tx).paymentIntent.findUnique({
      where: { providerReference },
    });

    return row ? toIntent(row) : null;
  }

  async findActiveByDeal(dealId: string, tx?: TxContext): Promise<PaymentIntent | null> {
    const row = await clientFrom(this.prisma, tx).paymentIntent.findFirst({
      where: { dealId, status: { in: ['CREATED', 'PENDING'] } },
    });

    return row ? toIntent(row) : null;
  }

  async create(input: CreatePaymentIntentInput, tx?: TxContext): Promise<PaymentIntent> {
    try {
      const row = await clientFrom(this.prisma, tx).paymentIntent.create({ data: input });
      return toIntent(row);
    } catch (error) {
      // O índice único parcial `payment_intents_one_active_per_deal` é o que
      // resolve a corrida entre dois pagamentos simultâneos (RN-092). Chegar
      // aqui significa que a outra tentativa ganhou.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = String(
          (error.meta as { target?: string | string[] } | undefined)?.target ?? '',
        );

        throw new ResourceConflictError(
          target.includes('idempotency_key')
            ? `Idempotency key "${input.idempotencyKey}" was already used`
            : `Deal ${input.dealId} already has an active payment intent`,
        );
      }

      throw error;
    }
  }

  async markCaptured(id: string, capturedAt: Date, tx?: TxContext): Promise<void> {
    await clientFrom(this.prisma, tx).paymentIntent.update({
      where: { id },
      data: { status: 'CAPTURED', capturedAt },
    });
  }

  async expireActiveByDeal(dealId: string, _at: Date, tx?: TxContext): Promise<void> {
    // `updateMany` e não `update`: pode não haver intenção nenhuma viva, e não
    // haver é o caso normal — um pedido que expirou sem ninguém tentar pagar.
    await clientFrom(this.prisma, tx).paymentIntent.updateMany({
      where: { dealId, status: { in: ['CREATED', 'PENDING'] } },
      data: { status: 'EXPIRED' },
    });
  }
}

@Injectable()
export class PrismaPaymentEventsRepository extends PaymentEventsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByProviderEventId(
    providerEventId: string,
    tx?: TxContext,
  ): Promise<PaymentEvent | null> {
    return clientFrom(this.prisma, tx).paymentEvent.findUnique({
      where: { providerEventId },
      select: {
        id: true,
        paymentIntentId: true,
        providerEventId: true,
        type: true,
        receivedAt: true,
        processedAt: true,
      },
    });
  }

  async recordIfNew(
    input: RecordPaymentEventInput,
    tx?: TxContext,
  ): Promise<PaymentEvent | null> {
    try {
      const row = await clientFrom(this.prisma, tx).paymentEvent.create({
        data: { ...input, payload: input.payload as Prisma.InputJsonValue },
      });

      return {
        id: row.id,
        paymentIntentId: row.paymentIntentId,
        providerEventId: row.providerEventId,
        type: row.type,
        receivedAt: row.receivedAt,
        processedAt: row.processedAt,
      };
    } catch (error) {
      // `UNIQUE(provider_event_id)`: a mesma notificação já tinha sido
      // processada. Devolver `null` é o que trava o segundo efeito (RN-091).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return null;
      }

      throw error;
    }
  }

  async markProcessed(id: string, processedAt: Date, tx?: TxContext): Promise<void> {
    await clientFrom(this.prisma, tx).paymentEvent.update({
      where: { id },
      data: { processedAt },
    });
  }
}
