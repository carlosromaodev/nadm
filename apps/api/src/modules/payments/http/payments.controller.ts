import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '@/core/auth/auth-context';
import { CurrentUser } from '@/core/auth/current-user.decorator';
import { Public } from '@/core/auth/public.decorator';
import { ZodValidationPipe } from '@/core/http/zod-validation.pipe';
import { startPaymentSchema, type StartPaymentBody } from '@/modules/deals/http/schemas';
import { PaymentsGateway } from '../application/ports/payments.gateway';
import { HandlePaymentCapturedUseCase } from '../application/use-cases/handle-payment-captured.use-case';
import { StartCounterOfferTopUpUseCase } from '../application/use-cases/start-counter-offer-top-up.use-case';
import { StartDealPaymentUseCase } from '../application/use-cases/start-deal-payment.use-case';
import { GetPaymentStatusUseCase, SimulatePaymentUseCase } from '../application/use-cases/payment-status.use-case';

@Controller()
export class PaymentsController {
  constructor(
    private readonly startPayment: StartDealPaymentUseCase,
    private readonly startTopUp: StartCounterOfferTopUpUseCase,
    private readonly handleCapture: HandlePaymentCapturedUseCase,
    private readonly gateway: PaymentsGateway,
    private readonly paymentStatus: GetPaymentStatusUseCase,
    private readonly simulatePayment: SimulatePaymentUseCase,
  ) {}

  @Post('deals/:id/payments')
  async start(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(startPaymentSchema)) body: StartPaymentBody,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'ValidationError',
        message: 'Idempotency-Key header is required for payment operations',
      });
    }

    const { intent, instructions, replayed } = await this.startPayment.execute({
      actorUserId: auth.userId,
      dealId: id,
      payerPhone: body.payerPhone,
      idempotencyKey,
    });

    return {
      intentId: intent.id,
      provider: intent.provider,
      status: intent.status,
      amount: { amount: intent.amountMinor.toString(), currency: intent.currency },
      expiresAt: intent.expiresAt.toISOString(),
      instructions,
      replayed,
    };
  }

  /**
   * O reforço da diferença de uma contraproposta mais cara.
   *
   * Mesma mecânica do pagamento inicial, e de propósito: é a captura que faz a
   * transição acontecer. Enquanto não for paga, o pedido continua em
   * `COUNTER_OFFERED` e o escrow vale o preço antigo.
   */
  @Post('deals/:id/counter-offers/top-up')
  async topUp(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(startPaymentSchema)) body: StartPaymentBody,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'ValidationError',
        message: 'Idempotency-Key header is required for payment operations',
      });
    }

    const { intent, instructions, replayed } = await this.startTopUp.execute({
      actorUserId: auth.userId,
      dealId: id,
      payerPhone: body.payerPhone,
      idempotencyKey,
    });

    return {
      intentId: intent.id,
      provider: intent.provider,
      status: intent.status,
      purpose: intent.purpose,
      amount: { amount: intent.amountMinor.toString(), currency: intent.currency },
      expiresAt: intent.expiresAt.toISOString(),
      instructions,
      replayed,
    };
  }

  @Get('deals/:id/payments/:intentId')
  async status(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('intentId', ParseUUIDPipe) intentId: string,
  ) {
    const intent = await this.paymentStatus.execute({ actorUserId: auth.userId, dealId: id, intentId });
    return { intentId: intent.id, provider: intent.provider, status: intent.status, expiresAt: intent.expiresAt.toISOString(), reference: intent.providerReference };
  }

  @Post('deals/:id/payments/:intentId/simulate')
  async simulate(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('intentId', ParseUUIDPipe) intentId: string,
  ) {
    return this.simulatePayment.execute({ actorUserId: auth.userId, dealId: id, intentId });
  }

  /**
   * Notificação do parceiro.
   *
   * Responde 200 mesmo a um evento já processado — o parceiro não deve
   * reentregar o que já foi aceite. Falha interna é que responde 500, para
   * provocar a reentrega.
   */
  @Public()
  @Post('webhooks/payments/:provider')
  async webhook(
    @Param('provider') provider: string,
    @Req() request: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string>,
  ) {
    const rawBody = request.rawBody?.toString('utf8') ?? JSON.stringify(request.body);

    if (provider !== this.gateway.provider) {
      throw new UnauthorizedException('Unknown payment provider');
    }

    if (!this.gateway.verifyWebhookSignature(rawBody, headers)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const outcome = await this.handleCapture.execute(this.gateway.parseWebhookEvent(rawBody));

    return { outcome };
  }
}
