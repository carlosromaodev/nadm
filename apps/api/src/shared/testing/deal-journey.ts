import { AcceptDealUseCase } from '@/modules/deals/application/use-cases/accept-deal.use-case';
import { ApproveDeliveryUseCase } from '@/modules/deals/application/use-cases/approve-delivery.use-case';
import { CreateDealUseCase } from '@/modules/deals/application/use-cases/create-deal.use-case';
import { DeclineDealUseCase } from '@/modules/deals/application/use-cases/decline-deal.use-case';
import { EscrowRefundService } from '@/modules/deals/application/use-cases/escrow-refund';
import { RejectDeliveryUseCase } from '@/modules/deals/application/use-cases/reject-delivery.use-case';
import { RequestRefundUseCase } from '@/modules/deals/application/use-cases/request-refund.use-case';
import { CounterOfferDealUseCase } from '@/modules/deals/application/use-cases/counter-offer-deal.use-case';
import { RespondCounterOfferUseCase } from '@/modules/deals/application/use-cases/respond-counter-offer.use-case';
import { RunDealDeadlinesUseCase } from '@/modules/deals/application/use-cases/run-deal-deadlines.use-case';
import {
  AdminPostMessageUseCase,
  AdminReadConversationUseCase,
} from '@/modules/deals/application/use-cases/admin-conversation.use-case';
import { FulfilContentUnlockUseCase } from '@/modules/deals/application/use-cases/fulfil-content-unlock.use-case';
import { EscrowReleaseService } from '@/modules/deals/application/use-cases/escrow-release';
import { SlotReleaseService } from '@/modules/deals/application/use-cases/slot-release';
import {
  OpenDisputeUseCase,
  WithdrawDisputeUseCase,
} from '@/modules/deals/application/use-cases/open-dispute.use-case';
import {
  ListOpenDisputesUseCase,
  ResolveDisputeUseCase,
} from '@/modules/deals/application/use-cases/resolve-dispute.use-case';
import { StartCounterOfferTopUpUseCase } from '@/modules/payments/application/use-cases/start-counter-offer-top-up.use-case';
import { SubmitDeliveryUseCase } from '@/modules/deals/application/use-cases/submit-delivery.use-case';
import { HandlePaymentCapturedUseCase } from '@/modules/payments/application/use-cases/handle-payment-captured.use-case';
import { StartDealPaymentUseCase } from '@/modules/payments/application/use-cases/start-deal-payment.use-case';
import type { Deal } from '@/modules/deals/domain/deal';
import type { TestContext } from './test-context';

/**
 * Os casos de uso de F1 ligados entre si, para um teste poder colocar um `Deal`
 * no estado que lhe interessa sem repetir seis chamadas em cada ficheiro.
 */
export function makeJourney(ctx: TestContext) {
  const escrowRelease = new EscrowReleaseService(
    ctx.deals,
    ctx.messages,
    ctx.ledger,
    ctx.wallets,
    ctx.outbox,
    ctx.auditLog,
    ctx.ids,
  );

  const contentUnlock = new FulfilContentUnlockUseCase(
    ctx.contents,
    ctx.offers,
    ctx.messages,
    escrowRelease,
    ctx.outbox,
    ctx.auditLog,
    ctx.ids,
  );

  const createDeal = new CreateDealUseCase(
    ctx.transactions,
    ctx.deals,
    ctx.references,
    ctx.offers,
    ctx.profiles,
    ctx.availability,
    ctx.accounts,
    ctx.messages,
    ctx.outbox,
    ctx.auditLog,
    ctx.ids,
    ctx.pricing,
    ctx.clock,
  );

  const acceptDeal = new AcceptDealUseCase(
    ctx.transactions,
    ctx.deals,
    ctx.messages,
    ctx.outbox,
    ctx.auditLog,
    ctx.ids,
    ctx.clock,
  );

  const startPayment = new StartDealPaymentUseCase(
    ctx.transactions,
    ctx.deals,
    ctx.paymentIntents,
    ctx.payments,
    ctx.auditLog,
    ctx.ids,
  );

  const handleCapture = new HandlePaymentCapturedUseCase(
    ctx.transactions,
    ctx.deals,
    ctx.paymentIntents,
    ctx.paymentEvents,
    ctx.messages,
    ctx.ledger,
    ctx.wallets,
    ctx.counterOffers,
    contentUnlock,
    ctx.outbox,
    ctx.auditLog,
    ctx.ids,
    ctx.pricing,
    ctx.clock,
  );

  const submitDelivery = new SubmitDeliveryUseCase(
    ctx.transactions,
    ctx.deals,
    ctx.deliveries,
    ctx.messages,
    ctx.outbox,
    ctx.auditLog,
    ctx.ids,
    ctx.clock,
  );

  const approveDelivery = new ApproveDeliveryUseCase(
    ctx.transactions,
    ctx.deals,
    ctx.deliveries,
    ctx.messages,
    ctx.disputes,
    escrowRelease,
    ctx.auditLog,
    ctx.ids,
    ctx.clock,
  );

  const slots = new SlotReleaseService(ctx.availability);

  const escrow = new EscrowRefundService(
    ctx.ledger,
    ctx.messages,
    ctx.outbox,
    ctx.auditLog,
    ctx.ids,
  );

  const declineDeal = new DeclineDealUseCase(
    ctx.transactions,
    ctx.deals,
    ctx.messages,
    ctx.paymentIntents,
    escrow,
    slots,
    ctx.outbox,
    ctx.auditLog,
    ctx.ids,
    ctx.clock,
  );

  const rejectDelivery = new RejectDeliveryUseCase(
    ctx.transactions,
    ctx.deals,
    ctx.deliveries,
    ctx.messages,
    ctx.outbox,
    ctx.auditLog,
    ctx.ids,
    ctx.clock,
  );

  const requestRefund = new RequestRefundUseCase(
    ctx.transactions,
    ctx.deals,
    ctx.messages,
    escrow,
    ctx.outbox,
    ctx.auditLog,
    ctx.ids,
    ctx.pricing,
    ctx.clock,
  );

  const counterOfferDeal = new CounterOfferDealUseCase(
    ctx.transactions,
    ctx.deals,
    ctx.counterOffers,
    ctx.messages,
    ctx.outbox,
    ctx.auditLog,
    ctx.ids,
    ctx.pricing,
    ctx.clock,
  );

  const respondCounterOffer = new RespondCounterOfferUseCase(
    ctx.transactions,
    ctx.deals,
    ctx.counterOffers,
    ctx.messages,
    ctx.ledger,
    ctx.wallets,
    escrow,
    slots,
    ctx.outbox,
    ctx.auditLog,
    ctx.ids,
    ctx.pricing,
    ctx.clock,
  );

  const startTopUp = new StartCounterOfferTopUpUseCase(
    ctx.transactions,
    ctx.deals,
    ctx.counterOffers,
    ctx.paymentIntents,
    ctx.payments,
    ctx.auditLog,
    ctx.ids,
    ctx.pricing,
  );

  const runDeadlines = new RunDealDeadlinesUseCase(
    ctx.transactions,
    ctx.deals,
    ctx.messages,
    ctx.paymentIntents,
    escrow,
    slots,
    approveDelivery,
    ctx.outbox,
    ctx.auditLog,
    ctx.ids,
    ctx.pricing,
    ctx.clock,
  );

  const openDispute = new OpenDisputeUseCase(
    ctx.transactions,
    ctx.deals,
    ctx.disputes,
    ctx.messages,
    ctx.outbox,
    ctx.auditLog,
    ctx.ids,
    ctx.clock,
  );

  const withdrawDispute = new WithdrawDisputeUseCase(
    ctx.transactions,
    ctx.deals,
    ctx.disputes,
    ctx.messages,
    ctx.outbox,
    ctx.auditLog,
    ctx.ids,
    ctx.clock,
  );

  const resolveDispute = new ResolveDisputeUseCase(
    ctx.transactions,
    ctx.deals,
    ctx.disputes,
    ctx.messages,
    escrow,
    ctx.outbox,
    ctx.auditLog,
    ctx.ids,
    ctx.clock,
  );

  const listOpenDisputes = new ListOpenDisputesUseCase(ctx.disputes);

  const adminReadConversation = new AdminReadConversationUseCase(
    ctx.transactions,
    ctx.deals,
    ctx.messages,
    ctx.deliveries,
    ctx.disputes,
    ctx.auditLog,
  );

  const adminPostMessage = new AdminPostMessageUseCase(
    ctx.transactions,
    ctx.deals,
    ctx.messages,
    ctx.disputes,
    ctx.auditLog,
    ctx.ids,
    ctx.clock,
  );

  /**
   * Percorre o caminho feliz até ao estado pedido.
   *
   * A ordem é a do design: criar, **pagar**, e só depois o criador aceitar um
   * pedido que já tem o dinheiro retido (DP-15).
   */
  async function advanceTo(
    target: 'PROPOSED' | 'PAGO' | 'ACCEPTED' | 'DELIVERED' | 'PAID',
    options: { buyerUserId?: string; offerId?: string; payerPhone?: string } = {},
  ): Promise<Deal> {
    const buyerUserId = options.buyerUserId ?? 'buyer';

    const deal = await createDeal.execute({
      actorUserId: buyerUserId,
      offerId: options.offerId ?? 'offer-1',
      brief: 'Parabéns para a minha irmã Ana, faz 30 anos no sábado.',
    });

    if (target === 'PROPOSED') return deal;

    const started = await startPayment.execute({
      actorUserId: buyerUserId,
      dealId: deal.id,
      payerPhone: options.payerPhone ?? '+244923000000',
      idempotencyKey: `pay-${deal.id}`,
    });

    const webhook = ctx.payments.captureAndBuildWebhook(started.intent.providerReference);
    await handleCapture.execute(ctx.payments.parseWebhookEvent(webhook));

    // PROPOSED com o escrow já em HELD: o pedido está pago e à espera do criador.
    if (target === 'PAGO') return (await ctx.deals.findById(deal.id))!;

    await acceptDeal.execute({ actorUserId: deal.creatorUserId, dealId: deal.id });
    if (target === 'ACCEPTED') return (await ctx.deals.findById(deal.id))!;

    await submitDelivery.execute({
      actorUserId: deal.creatorUserId,
      dealId: deal.id,
      note: 'Vídeo gravado e enviado. Espero que a Ana goste!',
    });

    if (target === 'DELIVERED') return (await ctx.deals.findById(deal.id))!;

    await approveDelivery.execute({ actorUserId: buyerUserId, dealId: deal.id });

    return (await ctx.deals.findById(deal.id))!;
  }

  return {
    createDeal,
    acceptDeal,
    declineDeal,
    startPayment,
    handleCapture,
    submitDelivery,
    approveDelivery,
    rejectDelivery,
    requestRefund,
    counterOfferDeal,
    respondCounterOffer,
    startTopUp,
    runDeadlines,
    escrow,
    contentUnlock,
    openDispute,
    withdrawDispute,
    resolveDispute,
    listOpenDisputes,
    adminReadConversation,
    adminPostMessage,
    advanceTo,
  };
}
