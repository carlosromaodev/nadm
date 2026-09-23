import { beforeEach, describe, expect, it } from 'vitest';
import { ResourceConflictError } from '@/core/errors/domain-error';
import { Money } from '@/shared/domain/money';
import { makeJourney } from '@/shared/testing/deal-journey';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';
import {
  CounterOfferUnchangedError,
  DealNotFoundError,
  InvalidDealTransitionError,
  NoPendingCounterOfferError,
  NotDealBuyerError,
  NotDealCreatorError,
  PaymentRequiredError,
} from '../../domain/errors';
import { STATE_CHANGE_BODY } from '../../domain/message';
import { counterOfferRefundReference } from './respond-counter-offer.use-case';

/** A oferta semeada custa 50 000,00 Kz; o comprador pagou 52 500,00 com a taxa. */
const PRECO_ORIGINAL = 5_000_000n;
const PAGO_ORIGINAL = 5_250_000n;

describe('contraproposta · T4, T5 e T6', () => {
  let ctx: TestContext;
  let journey: ReturnType<typeof makeJourney>;

  beforeEach(() => {
    ctx = makeTestContext();
    journey = makeJourney(ctx);

    ctx.seedUser({ id: 'buyer' });
    ctx.seedUser({ id: 'estranho' });
    ctx.seedCreator({ id: 'creator', handle: 'nelsonbeats' });
    ctx.seedOffer({ id: 'offer-1', profileId: 'profile-creator', priceMinor: PRECO_ORIGINAL });
  });

  const contrapor = (priceMinor: bigint, slaHours = 48, dealId?: string) =>
    journey.counterOfferDeal.execute({
      actorUserId: 'creator',
      dealId: dealId!,
      priceMinor: priceMinor.toString(),
      slaHours,
      message: 'Este trabalho leva-me mais tempo do que a tabela.',
    });

  describe('T4 · o criador contrapõe', () => {
    it('muda o estado sem tocar em dinheiro nenhum', async () => {
      const pago = await journey.advanceTo('PAGO');

      const { deal } = await contrapor(6_000_000n, 72, pago.id);

      expect(deal.status).toBe('COUNTER_OFFERED');
      expect(deal.escrowStatus).toBe('HELD');
      // Só a captura está no razão: contrapor é abrir uma pergunta.
      expect(ctx.db.ledger.map((t) => t.kind)).toEqual(['ESCROW_FUNDING']);
      expect(deal.amount.amountMinor).toBe(PAGO_ORIGINAL);
    });

    it('o prazo troca de dono: passa a ser o comprador a ter de responder', async () => {
      const pago = await journey.advanceTo('PAGO');
      const antes = pago.expiresAt;

      ctx.clock.advanceHours(5);
      const { deal, counterOffer } = await contrapor(6_000_000n, 72, pago.id);

      expect(deal.expiresAt?.getTime()).toBeGreaterThan(antes!.getTime());
      expect(counterOffer.expiresAt).toEqual(deal.expiresAt);
    });

    it('escreve a contraproposta na conversa com os números lá dentro', async () => {
      const pago = await journey.advanceTo('PAGO');

      await contrapor(6_000_000n, 72, pago.id);

      const conversa = await ctx.messages.listByDeal(pago.id, 50);

      // O separador de milhares é espaço inquebrável, para o valor não partir
      // de linha ao meio — a mesma convenção do design.
      const anuncio = conversa.find(
        (m) => m.kind === 'STATE_CHANGE' && m.body.includes('60\u00a0000'),
      );

      expect(anuncio?.body).toContain('72h');
    });

    it('recusa contrapropor exactamente os mesmos termos', async () => {
      const pago = await journey.advanceTo('PAGO');

      await expect(
        journey.counterOfferDeal.execute({
          actorUserId: 'creator',
          dealId: pago.id,
          priceMinor: PRECO_ORIGINAL.toString(),
          slaHours: 48,
        }),
      ).rejects.toThrow(CounterOfferUnchangedError);
    });

    it('aceita mudar só o prazo, sem mexer no preço', async () => {
      const pago = await journey.advanceTo('PAGO');

      const { counterOffer } = await contrapor(PRECO_ORIGINAL, 96, pago.id);

      expect(counterOffer.slaHours).toBe(96);
      expect(counterOffer.price.amountMinor).toBe(PRECO_ORIGINAL);
    });

    it('não contrapõe um pedido ainda por pagar', async () => {
      const porPagar = await journey.advanceTo('PROPOSED');

      await expect(contrapor(6_000_000n, 72, porPagar.id)).rejects.toThrow(PaymentRequiredError);
    });

    it('não contrapõe duas vezes seguidas', async () => {
      const pago = await journey.advanceTo('PAGO');
      await contrapor(6_000_000n, 72, pago.id);

      await expect(contrapor(7_000_000n, 72, pago.id)).rejects.toThrow(
        InvalidDealTransitionError,
      );
    });

    it('contrapor é do criador: ao comprador devolve 403, a um terceiro 404', async () => {
      const pago = await journey.advanceTo('PAGO');

      await expect(
        journey.counterOfferDeal.execute({
          actorUserId: 'buyer',
          dealId: pago.id,
          priceMinor: '6000000',
          slaHours: 72,
        }),
      ).rejects.toThrow(NotDealCreatorError);

      await expect(
        journey.counterOfferDeal.execute({
          actorUserId: 'estranho',
          dealId: pago.id,
          priceMinor: '6000000',
          slaHours: 72,
        }),
      ).rejects.toThrow(DealNotFoundError);
    });
  });

  describe('T5 · o comprador aceita, e o preço não subiu', () => {
    it('só o prazo mudou: troca o acordo sem mexer em dinheiro', async () => {
      const pago = await journey.advanceTo('PAGO');
      await contrapor(PRECO_ORIGINAL, 96, pago.id);

      const { outcome, topUp } = await journey.respondCounterOffer.accept({
        actorUserId: 'buyer',
        dealId: pago.id,
      });

      expect(outcome).toBe('settled');
      expect(topUp).toBeNull();

      const deal = (await ctx.deals.findById(pago.id))!;
      expect(deal.status).toBe('PROPOSED');
      expect(deal.amount.amountMinor).toBe(PAGO_ORIGINAL);
      expect(deal.offerSnapshot.slaHours).toBe(96);
      expect(ctx.db.ledger.map((t) => t.kind)).toEqual(['ESCROW_FUNDING']);
    });

    it('preço mais baixo: estorna a diferença e o escrow passa a valer o novo', async () => {
      const pago = await journey.advanceTo('PAGO');
      await contrapor(4_000_000n, 48, pago.id);

      await journey.respondCounterOffer.accept({ actorUserId: 'buyer', dealId: pago.id });

      const deal = (await ctx.deals.findById(pago.id))!;

      // 40 000,00 de preço → 42 000,00 pagos pelo comprador.
      expect(deal.amount.amountMinor).toBe(4_200_000n);

      const acerto = ctx.db.ledger.find((t) => t.kind === 'COUNTER_OFFER_REFUND')!;
      expect(acerto.entries.map((e) => [e.account, e.direction, e.amount.amountMinor])).toEqual([
        ['ESCROW', 'DEBIT', PAGO_ORIGINAL - 4_200_000n],
        ['REFUNDS_PAYABLE', 'CREDIT', PAGO_ORIGINAL - 4_200_000n],
      ]);

      // O que sobra retido é exactamente o valor novo do pedido.
      expect(await ctx.ledger.balanceOf('ESCROW', pago.id)).toEqual(
        Money.zero().subtract(deal.amount),
      );
    });

    it('o acerto soma zero, como qualquer lançamento (RN-100)', async () => {
      const pago = await journey.advanceTo('PAGO');
      await contrapor(4_000_000n, 48, pago.id);

      await journey.respondCounterOffer.accept({ actorUserId: 'buyer', dealId: pago.id });

      for (const transacao of ctx.db.ledger) {
        const soma = transacao.entries.reduce(
          (total, entrada) => total.add(entrada.signedAmount),
          Money.zero(),
        );
        expect(soma.isZero).toBe(true);
      }
    });

    it('o acordo novo fica com versão 2 e a contraproposta fica resolvida', async () => {
      const pago = await journey.advanceTo('PAGO');
      const { counterOffer } = await contrapor(4_000_000n, 48, pago.id);

      await journey.respondCounterOffer.accept({ actorUserId: 'buyer', dealId: pago.id });

      const deal = (await ctx.deals.findById(pago.id))!;
      expect(deal.offerSnapshot.version).toBe(2);

      expect((await ctx.counterOffers.findById(counterOffer.id))?.status).toBe('ACCEPTED');
      expect(await ctx.counterOffers.findPending(pago.id)).toBeNull();
    });

    it('o criador pode aceitar o pedido renegociado, e o dinheiro liberta-se pelo valor novo', async () => {
      const pago = await journey.advanceTo('PAGO');
      await contrapor(4_000_000n, 48, pago.id);
      await journey.respondCounterOffer.accept({ actorUserId: 'buyer', dealId: pago.id });

      await journey.acceptDeal.execute({ actorUserId: 'creator', dealId: pago.id });
      await journey.submitDelivery.execute({
        actorUserId: 'creator',
        dealId: pago.id,
        note: 'Entregue.',
      });
      await journey.approveDelivery.execute({ actorUserId: 'buyer', dealId: pago.id });

      // 40 000,00 de preço menos 5% = 38 000,00 para o criador.
      const carteira = await ctx.wallets.recomputeFromLedger('profile-creator', ctx.clock.now());
      expect(carteira.available.amountMinor).toBe(3_800_000n);

      // E o escrow do pedido fecha a zero: entrou, acertou-se, saiu.
      expect((await ctx.ledger.balanceOf('ESCROW', pago.id)).isZero).toBe(true);
    });
  });

  describe('T5 · o comprador aceita, e o preço subiu', () => {
    it('não transita nada: diz quanto falta reforçar', async () => {
      const pago = await journey.advanceTo('PAGO');
      await contrapor(6_000_000n, 72, pago.id);

      const { outcome, topUp } = await journey.respondCounterOffer.accept({
        actorUserId: 'buyer',
        dealId: pago.id,
      });

      expect(outcome).toBe('top_up_required');
      // 60 000,00 → 63 000,00 a pagar; já lá estão 52 500,00.
      expect(topUp?.amountMinor).toBe(6_300_000n - PAGO_ORIGINAL);

      const deal = (await ctx.deals.findById(pago.id))!;
      expect(deal.status).toBe('COUNTER_OFFERED');
      expect(deal.amount.amountMinor).toBe(PAGO_ORIGINAL);
    });

    it('a captura do reforço é que fecha o acordo (DP-15)', async () => {
      const pago = await journey.advanceTo('PAGO');
      await contrapor(6_000_000n, 72, pago.id);

      const { intent } = await journey.startTopUp.execute({
        actorUserId: 'buyer',
        dealId: pago.id,
        payerPhone: '+244923000000',
        idempotencyKey: `top-up-${pago.id}`,
      });

      expect(intent.purpose).toBe('TOP_UP');
      expect((await ctx.deals.findById(pago.id))?.status).toBe('COUNTER_OFFERED');

      const webhook = ctx.payments.captureAndBuildWebhook(intent.providerReference);
      const resultado = await journey.handleCapture.execute(
        ctx.payments.parseWebhookEvent(webhook),
      );

      expect(resultado).toBe('captured');

      const deal = (await ctx.deals.findById(pago.id))!;
      expect(deal.status).toBe('PROPOSED');
      expect(deal.amount.amountMinor).toBe(6_300_000n);
      expect(deal.offerSnapshot.slaHours).toBe(72);
    });

    it('o escrow passa a valer exactamente o preço novo', async () => {
      const pago = await journey.advanceTo('PAGO');
      await contrapor(6_000_000n, 72, pago.id);

      const { intent } = await journey.startTopUp.execute({
        actorUserId: 'buyer',
        dealId: pago.id,
        payerPhone: '+244923000000',
        idempotencyKey: `top-up-${pago.id}`,
      });

      await journey.handleCapture.execute(
        ctx.payments.parseWebhookEvent(ctx.payments.captureAndBuildWebhook(intent.providerReference)),
      );

      expect(await ctx.ledger.balanceOf('ESCROW', pago.id)).toEqual(
        Money.zero().subtract(Money.fromMinor(6_300_000n)),
      );
    });

    it('o mesmo reforço capturado duas vezes produz um efeito só (RN-091)', async () => {
      const pago = await journey.advanceTo('PAGO');
      await contrapor(6_000_000n, 72, pago.id);

      const { intent } = await journey.startTopUp.execute({
        actorUserId: 'buyer',
        dealId: pago.id,
        payerPhone: '+244923000000',
        idempotencyKey: `top-up-${pago.id}`,
      });

      const webhook = ctx.payments.captureAndBuildWebhook(intent.providerReference);
      await journey.handleCapture.execute(ctx.payments.parseWebhookEvent(webhook));
      const segunda = await journey.handleCapture.execute(ctx.payments.parseWebhookEvent(webhook));

      expect(segunda).toBe('duplicate');
      expect(ctx.db.ledger.filter((t) => t.kind === 'ESCROW_TOP_UP')).toHaveLength(1);
      expect((await ctx.deals.findById(pago.id))?.amount.amountMinor).toBe(6_300_000n);
    });

    it('recusa reforçar uma contraproposta que não exige reforço', async () => {
      const pago = await journey.advanceTo('PAGO');
      await contrapor(4_000_000n, 48, pago.id);

      await expect(
        journey.startTopUp.execute({
          actorUserId: 'buyer',
          dealId: pago.id,
          payerPhone: '+244923000000',
          idempotencyKey: `top-up-${pago.id}`,
        }),
      ).rejects.toThrow(ResourceConflictError);
    });
  });

  describe('T6 · o comprador recusa os termos novos', () => {
    it('fecha o negócio e devolve o dinheiro do acordo original', async () => {
      const pago = await journey.advanceTo('PAGO');
      const { counterOffer } = await contrapor(6_000_000n, 72, pago.id);

      const deal = await journey.respondCounterOffer.decline({
        actorUserId: 'buyer',
        dealId: pago.id,
      });

      expect(deal.status).toBe('DECLINED');
      expect(deal.escrowStatus).toBe('REFUNDED');
      expect((await ctx.ledger.balanceOf('ESCROW', pago.id)).isZero).toBe(true);
      expect((await ctx.counterOffers.findById(counterOffer.id))?.status).toBe('DECLINED');
    });

    it('conta a recusa e a devolução na conversa', async () => {
      const pago = await journey.advanceTo('PAGO');
      await contrapor(6_000_000n, 72, pago.id);

      await journey.respondCounterOffer.decline({ actorUserId: 'buyer', dealId: pago.id });

      const conversa = await ctx.messages.listByDeal(pago.id, 50);
      expect(conversa.some((m) => m.body === STATE_CHANGE_BODY.COUNTER_OFFER_DECLINED)).toBe(true);
      expect(conversa.some((m) => m.body === STATE_CHANGE_BODY.REFUNDED)).toBe(true);
    });

    it('responder é do comprador: ao criador devolve 403, a um terceiro 404', async () => {
      const pago = await journey.advanceTo('PAGO');
      await contrapor(6_000_000n, 72, pago.id);

      await expect(
        journey.respondCounterOffer.decline({ actorUserId: 'creator', dealId: pago.id }),
      ).rejects.toThrow(NotDealBuyerError);

      await expect(
        journey.respondCounterOffer.accept({ actorUserId: 'estranho', dealId: pago.id }),
      ).rejects.toThrow(DealNotFoundError);
    });

    it('sem contraproposta à espera não há nada a responder', async () => {
      const pago = await journey.advanceTo('PAGO');

      await expect(
        journey.respondCounterOffer.accept({ actorUserId: 'buyer', dealId: pago.id }),
      ).rejects.toThrow(NoPendingCounterOfferError);
    });
  });

  describe('T13 · a contraproposta também expira', () => {
    it('sem resposta do comprador o pedido morre e o dinheiro volta', async () => {
      const pago = await journey.advanceTo('PAGO');
      await contrapor(6_000_000n, 72, pago.id);

      ctx.clock.advanceHours(48);

      const resultado = await journey.runDeadlines.execute();

      expect(resultado.expired).toBe(1);

      const deal = (await ctx.deals.findById(pago.id))!;
      expect(deal.status).toBe('EXPIRED');
      expect(deal.escrowStatus).toBe('REFUNDED');
      expect((await ctx.ledger.balanceOf('ESCROW', pago.id)).isZero).toBe(true);
    });

    it('não expira enquanto o comprador ainda tem tempo', async () => {
      const pago = await journey.advanceTo('PAGO');
      await contrapor(6_000_000n, 72, pago.id);

      ctx.clock.advanceHours(47);

      expect((await journey.runDeadlines.execute()).expired).toBe(0);
      expect((await ctx.deals.findById(pago.id))?.status).toBe('COUNTER_OFFERED');
    });
  });

  describe('idempotência do acerto (RN-104)', () => {
    it('a chave semântica do estorno parcial é a da contraproposta', async () => {
      const pago = await journey.advanceTo('PAGO');
      const { counterOffer } = await contrapor(4_000_000n, 48, pago.id);

      await journey.respondCounterOffer.accept({ actorUserId: 'buyer', dealId: pago.id });

      expect(
        await ctx.ledger.existsByExternalReference(
          'COUNTER_OFFER_REFUND',
          counterOfferRefundReference(counterOffer.id),
        ),
      ).toBe(true);
    });

    it('aceitar duas vezes não lança dois acertos', async () => {
      const pago = await journey.advanceTo('PAGO');
      await contrapor(4_000_000n, 48, pago.id);

      await journey.respondCounterOffer.accept({ actorUserId: 'buyer', dealId: pago.id });

      await expect(
        journey.respondCounterOffer.accept({ actorUserId: 'buyer', dealId: pago.id }),
      ).rejects.toThrow(NoPendingCounterOfferError);

      expect(ctx.db.ledger.filter((t) => t.kind === 'COUNTER_OFFER_REFUND')).toHaveLength(1);
    });
  });
});
