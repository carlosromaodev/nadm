import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { AuthenticatedUser } from '@/core/auth/auth-context';
import { CurrentUser } from '@/core/auth/current-user.decorator';
import { Roles } from '@/core/auth/roles.decorator';
import { ZodValidationPipe } from '@/core/http/zod-validation.pipe';
import {
  AdminPostMessageUseCase,
  AdminReadConversationUseCase,
} from '../application/use-cases/admin-conversation.use-case';
import {
  OpenDisputeUseCase,
  WithdrawDisputeUseCase,
} from '../application/use-cases/open-dispute.use-case';
import {
  ListOpenDisputesUseCase,
  ResolveDisputeUseCase,
} from '../application/use-cases/resolve-dispute.use-case';
import { presentDeal, presentDelivery, presentDispute, presentMessage } from './presenters';
import {
  adminMessageSchema,
  openDisputeSchema,
  resolveDisputeSchema,
  type AdminMessageBody,
  type OpenDisputeBody,
  type ResolveDisputeBody,
} from './schemas';

@Controller('deals')
export class DisputesController {
  constructor(
    private readonly openDispute: OpenDisputeUseCase,
    private readonly withdrawDispute: WithdrawDisputeUseCase,
  ) {}

  /** Qualquer uma das partes abre. Não tem dono exclusivo, de propósito. */
  @Post(':id/disputes')
  async open(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(openDisputeSchema)) body: OpenDisputeBody,
  ) {
    const { deal, dispute } = await this.openDispute.execute({
      actorUserId: auth.userId,
      dealId: id,
      reason: body.reason,
    });

    return { deal: presentDeal(deal), dispute: presentDispute(dispute) };
  }

  @Post(':id/disputes/withdraw')
  @HttpCode(200)
  async withdraw(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return presentDispute(
      await this.withdrawDispute.execute({ actorUserId: auth.userId, dealId: id }),
    );
  }
}

/**
 * A administração decide as disputas e entra na conversa.
 *
 * **Só com disputa aberta** — sem ela, ler a conversa de duas pessoas não é
 * uma prerrogativa, é uma intrusão (RN-064). E cada leitura fica na auditoria.
 */
@Controller('admin/disputes')
@Roles('ADMIN')
export class AdminDisputesController {
  constructor(
    private readonly queue: ListOpenDisputesUseCase,
    private readonly resolve: ResolveDisputeUseCase,
    private readonly readConversation: AdminReadConversationUseCase,
    private readonly postMessage: AdminPostMessageUseCase,
  ) {}

  @Get()
  async list() {
    const disputes = await this.queue.execute({});

    return { data: disputes.map(presentDispute) };
  }

  @Get('deals/:dealId/conversation')
  async conversation(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('dealId', ParseUUIDPipe) dealId: string,
  ) {
    const { deal, messages, deliveries, dispute } = await this.readConversation.execute({
      adminUserId: auth.userId,
      dealId,
    });

    return {
      ...presentDeal(deal),
      dispute: presentDispute(dispute),
      messages: messages.map(presentMessage),
      deliveries: deliveries.map(presentDelivery),
    };
  }

  @Post('deals/:dealId/messages')
  async message(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('dealId', ParseUUIDPipe) dealId: string,
    @Body(new ZodValidationPipe(adminMessageSchema)) body: AdminMessageBody,
  ) {
    return presentMessage(
      await this.postMessage.execute({
        adminUserId: auth.userId,
        dealId,
        body: body.body,
      }),
    );
  }

  @Post(':id/resolve')
  @HttpCode(200)
  async decide(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(resolveDisputeSchema)) body: ResolveDisputeBody,
  ) {
    const { deal, dispute } = await this.resolve.execute({
      reviewerUserId: auth.userId,
      disputeId: id,
      resolution: body.resolution,
      note: body.note,
    });

    return { deal: presentDeal(deal), dispute: presentDispute(dispute) };
  }
}
