import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '@/core/auth/current-user.decorator';
import type { AuthenticatedUser } from '@/core/auth/auth-context';
import { ZodValidationPipe } from '@/core/http/zod-validation.pipe';
import { AcceptDealUseCase } from '../application/use-cases/accept-deal.use-case';
import { ApproveDeliveryUseCase } from '../application/use-cases/approve-delivery.use-case';
import { CounterOfferDealUseCase } from '../application/use-cases/counter-offer-deal.use-case';
import { CreateDealUseCase } from '../application/use-cases/create-deal.use-case';
import { DeclineDealUseCase } from '../application/use-cases/decline-deal.use-case';
import { GetDealUseCase, ListDealsUseCase } from '../application/use-cases/get-deal.use-case';
import { ListMessagesUseCase } from '../application/use-cases/list-messages.use-case';
import { RejectDeliveryUseCase } from '../application/use-cases/reject-delivery.use-case';
import { RespondCounterOfferUseCase } from '../application/use-cases/respond-counter-offer.use-case';
import { RequestRefundUseCase } from '../application/use-cases/request-refund.use-case';
import { SendMessageUseCase } from '../application/use-cases/send-message.use-case';
import { SubmitDeliveryUseCase } from '../application/use-cases/submit-delivery.use-case';
import { PricingPolicy } from '@/shared/application/ports/pricing-policy';
import { presentCounterOffer, presentDeal, presentDelivery, presentDispute, presentMessage } from './presenters';
import {
  counterOfferSchema,
  createDealSchema,
  declineDealSchema,
  listDealsQuerySchema,
  rejectDeliverySchema,
  sendMessageSchema,
  submitDeliverySchema,
  type CounterOfferBody,
  type CreateDealBody,
  type DeclineDealBody,
  type ListDealsQuery,
  type RejectDeliveryBody,
  type SendMessageBody,
  type SubmitDeliveryBody,
} from './schemas';

@Controller('deals')
export class DealsController {
  constructor(
    private readonly createDeal: CreateDealUseCase,
    private readonly acceptDeal: AcceptDealUseCase,
    private readonly declineDeal: DeclineDealUseCase,
    private readonly counterOfferDeal: CounterOfferDealUseCase,
    private readonly respondCounterOffer: RespondCounterOfferUseCase,
    private readonly submitDelivery: SubmitDeliveryUseCase,
    private readonly approveDelivery: ApproveDeliveryUseCase,
    private readonly rejectDelivery: RejectDeliveryUseCase,
    private readonly requestRefund: RequestRefundUseCase,
    private readonly sendMessage: SendMessageUseCase,
    private readonly listMessages: ListMessagesUseCase,
    private readonly getDeal: GetDealUseCase,
    private readonly listDeals: ListDealsUseCase,
    private readonly pricing: PricingPolicy,
  ) {}

  /** A parte da política de prazos que a interface precisa de conhecer. */
  private get policy() {
    return { lateDeliveryGraceHours: this.pricing.lateDeliveryGraceHours() };
  }

  @Post()
  async create(
    @CurrentUser() auth: AuthenticatedUser,
    @Body(new ZodValidationPipe(createDealSchema)) body: CreateDealBody,
  ) {
    const deal = await this.createDeal.execute({
      actorUserId: auth.userId,
      offerId: body.offerId,
      brief: body.brief,
      accountId: body.accountId,
      availabilityWindowId: body.availabilityWindowId,
    });

    return presentDeal(deal, this.policy);
  }

  @Get()
  async list(
    @CurrentUser() auth: AuthenticatedUser,
    @Query(new ZodValidationPipe(listDealsQuerySchema)) query: ListDealsQuery,
  ) {
    const deals = await this.listDeals.execute({
      actorUserId: auth.userId,
      role: query.role,
      status: query.status,
      limit: query.limit,
    });

    return { data: deals.map((deal) => presentDeal(deal, this.policy)) };
  }

  @Get(':id')
  async detail(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const { deal, messages, deliveries, counterOffers, dispute, viewerRole } =
      await this.getDeal.execute({ actorUserId: auth.userId, dealId: id });

    return {
      ...presentDeal(deal, this.policy),
      viewerRole,
      dispute: dispute ? presentDispute(dispute) : null,
      messages: messages.map(presentMessage),
      deliveries: deliveries.map(presentDelivery),
      counterOffers: counterOffers.map(presentCounterOffer),
    };
  }

  @Post(':id/accept')
  async accept(@CurrentUser() auth: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const deal = await this.acceptDeal.execute({ actorUserId: auth.userId, dealId: id });

    return presentDeal(deal, this.policy);
  }

  @Post(':id/decline')
  async decline(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(declineDealSchema)) body: DeclineDealBody,
  ) {
    const deal = await this.declineDeal.execute({
      actorUserId: auth.userId,
      dealId: id,
      reason: body.reason,
    });

    return presentDeal(deal, this.policy);
  }

  /** T4 — o criador responde com outro preço, outro prazo, ou ambos. */
  @Post(':id/counter-offers')
  async counterOffer(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(counterOfferSchema)) body: CounterOfferBody,
  ) {
    const { deal, counterOffer } = await this.counterOfferDeal.execute({
      actorUserId: auth.userId,
      dealId: id,
      priceMinor: body.priceMinor,
      slaHours: body.slaHours,
      message: body.message,
    });

    return { deal: presentDeal(deal, this.policy), counterOffer: presentCounterOffer(counterOffer) };
  }

  /**
   * T5 — o comprador aceita os termos novos.
   *
   * Se o preço subiu, nada transita ainda: a resposta diz quanto falta
   * reforçar, e é a captura desse reforço que fecha o acordo (DP-15).
   */
  @Post(':id/counter-offers/accept')
  @HttpCode(200)
  async acceptCounterOffer(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const { deal, counterOffer, outcome, topUp } = await this.respondCounterOffer.accept({
      actorUserId: auth.userId,
      dealId: id,
    });

    return {
      deal: presentDeal(deal, this.policy),
      counterOffer: presentCounterOffer(counterOffer),
      outcome,
      topUp: topUp ? { amount: topUp.amountMinor.toString(), currency: topUp.currency } : null,
    };
  }

  /** T6 — o comprador recusa os termos novos e o negócio fecha, com estorno. */
  @Post(':id/counter-offers/decline')
  @HttpCode(200)
  async declineCounterOffer(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const deal = await this.respondCounterOffer.decline({
      actorUserId: auth.userId,
      dealId: id,
    });

    return presentDeal(deal, this.policy);
  }

  /**
   * T16 — o prazo de entrega foi ultrapassado e o comprador quer o dinheiro de
   * volta. Não existe rota nenhuma que liberte escrow; esta devolve-o, e ainda
   * assim quem o move é a transição, não o pedido HTTP.
   */
  @Post(':id/refund')
  @HttpCode(200)
  async refund(@CurrentUser() auth: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const deal = await this.requestRefund.execute({ actorUserId: auth.userId, dealId: id });

    return presentDeal(deal, this.policy);
  }

  @Get(':id/messages')
  async messages(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const messages = await this.listMessages.execute({
      actorUserId: auth.userId,
      dealId: id,
    });

    return { data: messages.map(presentMessage) };
  }

  @Post(':id/messages')
  async postMessage(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageBody,
  ) {
    const message = await this.sendMessage.execute({
      actorUserId: auth.userId,
      dealId: id,
      body: body.body,
      clientId: body.clientId,
    });

    return presentMessage(message);
  }

  @Post(':id/deliveries')
  async deliver(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(submitDeliverySchema)) body: SubmitDeliveryBody,
  ) {
    const { deal, delivery } = await this.submitDelivery.execute({
      actorUserId: auth.userId,
      dealId: id,
      note: body.note,
    });

    return { deal: presentDeal(deal, this.policy), delivery: presentDelivery(delivery) };
  }

  @Post(':id/deliveries/:version/approve')
  @HttpCode(200)
  async approve(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    const deal = await this.approveDelivery.execute({ actorUserId: auth.userId, dealId: id, expectedVersion: version });

    return presentDeal(deal, this.policy);
  }

  @Post(':id/deliveries/:version/reject')
  @HttpCode(200)
  async reject(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('version', ParseIntPipe) version: number,
    @Body(new ZodValidationPipe(rejectDeliverySchema)) body: RejectDeliveryBody,
  ) {
    const { deal, delivery } = await this.rejectDelivery.execute({
      actorUserId: auth.userId,
      dealId: id,
      reason: body.reason,
      expectedVersion: version,
    });

    return { deal: presentDeal(deal, this.policy), delivery: presentDelivery(delivery) };
  }
}
