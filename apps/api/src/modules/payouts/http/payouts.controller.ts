import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { AuthenticatedUser } from '@/core/auth/auth-context';
import { CurrentUser } from '@/core/auth/current-user.decorator';
import { Roles } from '@/core/auth/roles.decorator';
import { ZodValidationPipe } from '@/core/http/zod-validation.pipe';
import {
  AdminPayoutUseCase,
  CancelPayoutUseCase,
} from '../application/use-cases/manage-payout.use-case';
import {
  ListMyPayoutsUseCase,
  ListPayoutQueueUseCase,
} from '../application/use-cases/list-payouts.use-case';
import { RequestPayoutUseCase } from '../application/use-cases/request-payout.use-case';
import { presentPayout } from './presenters';
import {
  failPayoutSchema,
  markProcessingSchema,
  payoutQueueQuerySchema,
  requestPayoutSchema,
  type FailPayoutBody,
  type MarkProcessingBody,
  type PayoutQueueQuery,
  type RequestPayoutBody,
} from './schemas';

@Controller('payouts')
export class PayoutsController {
  constructor(
    private readonly requestPayout: RequestPayoutUseCase,
    private readonly cancelPayout: CancelPayoutUseCase,
    private readonly listMine: ListMyPayoutsUseCase,
  ) {}

  @Post()
  async request(
    @CurrentUser() auth: AuthenticatedUser,
    @Body(new ZodValidationPipe(requestPayoutSchema)) body: RequestPayoutBody,
  ) {
    const payout = await this.requestPayout.execute({
      actorUserId: auth.userId,
      amountMinor: body.amountMinor,
      method: body.method,
      destination: body.destination,
    });

    return presentPayout(payout);
  }

  @Get()
  async list(@CurrentUser() auth: AuthenticatedUser) {
    const payouts = await this.listMine.execute({ actorUserId: auth.userId });

    return { data: payouts.map(presentPayout) };
  }

  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const payout = await this.cancelPayout.execute({
      actorUserId: auth.userId,
      payoutId: id,
    });

    return presentPayout(payout);
  }
}

/**
 * As rotas da administração.
 *
 * **É o único sítio do sistema em que o papel decide o acesso.** Em todo o
 * resto a pergunta é a relação com o recurso, e a resposta a quem não tem
 * relação é 404. Aqui é 403: quem chega e não é administração não fica a saber
 * nada que já não soubesse.
 */
@Controller('admin/payouts')
@Roles('ADMIN')
export class AdminPayoutsController {
  constructor(
    private readonly queue: ListPayoutQueueUseCase,
    private readonly admin: AdminPayoutUseCase,
  ) {}

  @Get()
  async list(@Query(new ZodValidationPipe(payoutQueueQuerySchema)) query: PayoutQueueQuery) {
    const payouts = await this.queue.execute({ status: query.status, limit: query.limit });

    return { data: payouts.map(presentPayout) };
  }

  @Post(':id/approve')
  @HttpCode(200)
  async approve(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return presentPayout(
      await this.admin.approve({ reviewerUserId: auth.userId, payoutId: id }),
    );
  }

  @Post(':id/processing')
  @HttpCode(200)
  async processing(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(markProcessingSchema)) body: MarkProcessingBody,
  ) {
    return presentPayout(
      await this.admin.markProcessing({
        reviewerUserId: auth.userId,
        payoutId: id,
        providerReference: body.providerReference,
      }),
    );
  }

  @Post(':id/settle')
  @HttpCode(200)
  async settle(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return presentPayout(
      await this.admin.settle({ reviewerUserId: auth.userId, payoutId: id }),
    );
  }

  @Post(':id/fail')
  @HttpCode(200)
  async fail(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(failPayoutSchema)) body: FailPayoutBody,
  ) {
    return presentPayout(
      await this.admin.fail({
        reviewerUserId: auth.userId,
        payoutId: id,
        reason: body.reason,
      }),
    );
  }
}
