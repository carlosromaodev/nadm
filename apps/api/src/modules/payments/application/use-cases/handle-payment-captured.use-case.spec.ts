import { beforeEach, describe, expect, it } from 'vitest';
import { Money } from '@/shared/domain/money';
import { makeJourney } from '@/shared/testing/deal-journey';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';

const TELEFONE = '+244923000000';

describe('HandlePaymentCapturedUseCase', () => {
  let ctx: TestContext;
  let journey: ReturnType<typeof makeJourney>;

  beforeEach(() => {
    ctx = makeTestContext();
    journey = makeJourney(ctx);

    ctx.seedUser({ id: 'buyer' });
    ctx.seedCreator({ id: 'creator', handle: 'nelsonbeats' });
    ctx.seedOffer({ id: 'offer-1', profileId: 'profile-creator' });
  });

  /** Deixa um pedido aceite com intenção emitida, pronto para a notificação. */
  async function aguardandoPagamento(payerPhone = TELEFONE) {
    const porPagar = await journey.advanceTo('PROPOSED');

    const { intent } = await journey.startPayment.execute({
      actorUserId: 'buyer',
      dealId: porPagar.id,
      payerPhone,
      idempotencyKey: `pay-${porPagar.id}`,
    });

    return { deal: porPagar, intent };
  }

  describe('caminho normal', () => {
    it('retém o dinheiro sem mexer no estado comercial (E1)', async () => {
      const { deal, intent } = await aguardandoPagamento();

      const corpo = ctx.payments.captureAndBuildWebhook(intent.providerReference);
      const resultado = await journey.handleCapture.execute(ctx.payments.parseWebhookEvent(corpo));

      const actualizado = await ctx.deals.findById(deal.id);

      expect(resultado).toBe('captured');
      // O pedido continua à espera da decisão do criador: o que mudou foi só
      // onde o dinheiro está.
      expect(actualizado!.status).toBe('PROPOSED');
      expect(actualizado!.escrowStatus).toBe('HELD');
    });

    it('não arranca o prazo de entrega — isso é a aceitação que faz', async () => {
      const { deal, intent } = await aguardandoPagamento();

      const corpo = ctx.payments.captureAndBuildWebhook(intent.providerReference);
      await journey.handleCapture.execute(ctx.payments.parseWebhookEvent(corpo));

      const actualizado = await ctx.deals.findById(deal.id);

      expect(actualizado!.toProps().dueAt).toBeNull();
    });

    it('marca a intenção como capturada', async () => {
      const { intent } = await aguardandoPagamento();

      const corpo = ctx.payments.captureAndBuildWebhook(intent.providerReference);
      await journey.handleCapture.execute(ctx.payments.parseWebhookEvent(corpo));

      const guardada = await ctx.paymentIntents.findById(intent.id);

      expect(guardada!.status).toBe('CAPTURED');
      expect(guardada!.capturedAt).not.toBeNull();
    });

    it('escreve a transição na conversa e avisa o criador', async () => {
      const { deal, intent } = await aguardandoPagamento();

      const corpo = ctx.payments.captureAndBuildWebhook(intent.providerReference);
      await journey.handleCapture.execute(ctx.payments.parseWebhookEvent(corpo));

      const conversa = await ctx.messages.listByDeal(deal.id, 50);

      expect(conversa.at(-1)!.body).toContain('Pagamento confirmado');
      expect(conversa.at(-1)!.body).toContain('retido na NaDM');
      expect(ctx.db.outbox.map((evento) => evento.type)).toContain('payment.captured');
    });

    it('a captura não lança nada no razão — o escrow ainda é uma obrigação', async () => {
      const { intent } = await aguardandoPagamento();

      const corpo = ctx.payments.captureAndBuildWebhook(intent.providerReference);
      await journey.handleCapture.execute(ctx.payments.parseWebhookEvent(corpo));

      const carteira = await ctx.wallets.recomputeFromLedger('profile-creator', ctx.clock.now());

      expect(carteira.available.amountMinor).toBe(0n);
    });

    it('a auditoria regista o parceiro como autor, não um utilizador', async () => {
      const { intent } = await aguardandoPagamento();

      const corpo = ctx.payments.captureAndBuildWebhook(intent.providerReference);
      await journey.handleCapture.execute(ctx.payments.parseWebhookEvent(corpo));

      expect(ctx.db.auditLog).toContainEqual(
        expect.objectContaining({
          action: 'payment.captured',
          actorKind: 'PROVIDER',
          actorUserId: null,
        }),
      );
    });
  });

  describe('idempotência (RN-091)', () => {
    it('a mesma notificação entregue duas vezes só produz efeito uma vez', async () => {
      const { deal, intent } = await aguardandoPagamento();

      const corpo = ctx.payments.captureAndBuildWebhook(intent.providerReference, 'evt-1');

      const primeira = await journey.handleCapture.execute(ctx.payments.parseWebhookEvent(corpo));
      const segunda = await journey.handleCapture.execute(ctx.payments.parseWebhookEvent(corpo));

      expect(primeira).toBe('captured');
      expect(segunda).toBe('duplicate');

      const actualizado = await ctx.deals.findById(deal.id);
      expect(actualizado!.escrowStatus).toBe('HELD');
    });

    it('a segunda entrega não escreve nada na conversa nem no outbox', async () => {
      const { deal, intent } = await aguardandoPagamento();

      const corpo = ctx.payments.captureAndBuildWebhook(intent.providerReference, 'evt-1');

      await journey.handleCapture.execute(ctx.payments.parseWebhookEvent(corpo));
      const mensagensDepoisDaPrimeira = (await ctx.messages.listByDeal(deal.id, 50)).length;
      const outboxDepoisDaPrimeira = ctx.db.outbox.length;

      await journey.handleCapture.execute(ctx.payments.parseWebhookEvent(corpo));

      expect(await ctx.messages.listByDeal(deal.id, 50)).toHaveLength(mensagensDepoisDaPrimeira);
      expect(ctx.db.outbox).toHaveLength(outboxDepoisDaPrimeira);
    });
  });

  describe('caminhos de erro', () => {
    it('ignora uma notificação para uma referência que não conhece', async () => {
      const resultado = await journey.handleCapture.execute({
        providerEventId: 'evt-desconhecido',
        providerReference: 'FAKE-NAO-EXISTE',
        type: 'payment.captured',
        occurredAt: ctx.clock.now(),
        raw: {},
      });

      expect(resultado).toBe('unknown_reference');
    });

    it('não move o escrow quando o valor capturado difere do esperado (RN-094)', async () => {
      // O gateway falso desconta um cêntimo quando a referência termina em 33.
      const { deal, intent } = await aguardandoPagamento();

      const corpo = JSON.stringify({
        eventId: 'evt-divergente',
        reference: intent.providerReference,
        type: 'payment.captured',
        amount: '5249999',
        currency: 'AOA',
      });

      const resultado = await journey.handleCapture.execute(ctx.payments.parseWebhookEvent(corpo));

      const actualizado = await ctx.deals.findById(deal.id);

      expect(resultado).toBe('amount_mismatch');
      expect(actualizado!.status).toBe('PROPOSED');
      expect(actualizado!.escrowStatus).toBe('PENDING');
    });

    it('a divergência de valor fica marcada para reconciliação e alerta', async () => {
      const { intent } = await aguardandoPagamento();

      const corpo = JSON.stringify({
        eventId: 'evt-divergente',
        reference: intent.providerReference,
        type: 'payment.captured',
        amount: '5249999',
        currency: 'AOA',
      });

      await journey.handleCapture.execute(ctx.payments.parseWebhookEvent(corpo));

      expect(ctx.db.outbox).toContainEqual(
        expect.objectContaining({
          type: 'payment.amount_mismatch',
          payload: expect.objectContaining({ expectedMinor: '5250000', capturedMinor: '5249999' }),
        }),
      );

      expect(ctx.db.auditLog.map((registo) => registo.action)).toContain(
        'payment.amount_mismatch',
      );
    });

    it('uma notificação de falha não move o pedido', async () => {
      const { deal, intent } = await aguardandoPagamento();

      const corpo = JSON.stringify({
        eventId: 'evt-falha',
        reference: intent.providerReference,
        type: 'payment.failed',
      });

      const resultado = await journey.handleCapture.execute(ctx.payments.parseWebhookEvent(corpo));

      const actualizado = await ctx.deals.findById(deal.id);

      expect(resultado).toBe('ignored');
      expect(actualizado!.escrowStatus).toBe('PENDING');
    });
  });

  describe('E1 · o dinheiro entra no razão', () => {
    it('lança DÉBITO PROVIDER_CLEARING / CRÉDITO ESCROW pelo valor capturado', async () => {
      const { deal, intent } = await aguardandoPagamento();

      const corpo = ctx.payments.captureAndBuildWebhook(intent.providerReference);
      await journey.handleCapture.execute(ctx.payments.parseWebhookEvent(corpo));

      const captura = ctx.db.ledger.find((t) => t.kind === 'ESCROW_FUNDING')!;

      expect(
        captura.entries.map((e) => [e.account, e.direction, e.amount.amountMinor]),
      ).toEqual([
        ['PROVIDER_CLEARING', 'DEBIT', 5_250_000n],
        ['ESCROW', 'CREDIT', 5_250_000n],
      ]);

      const soma = captura.entries.reduce(
        (total, entrada) => total.add(entrada.signedAmount),
        Money.zero(),
      );
      expect(soma.isZero).toBe(true);

      // A obrigação da plataforma perante este `Deal`, em sinal contabilístico.
      expect(await ctx.ledger.balanceOf('ESCROW', deal.id)).toEqual(
        Money.zero().subtract(deal.amount),
      );
    });

    it('a mesma notificação entregue duas vezes lança uma vez só (RN-091, RN-104)', async () => {
      const { intent } = await aguardandoPagamento();

      const corpo = ctx.payments.captureAndBuildWebhook(intent.providerReference);
      await journey.handleCapture.execute(ctx.payments.parseWebhookEvent(corpo));
      await journey.handleCapture.execute(ctx.payments.parseWebhookEvent(corpo));

      expect(ctx.db.ledger.filter((t) => t.kind === 'ESCROW_FUNDING')).toHaveLength(1);
    });

    it('um valor diferente do esperado não lança nada (RN-094)', async () => {
      const { intent } = await aguardandoPagamento();

      const corpo = JSON.stringify({
        eventId: 'evt-divergente',
        reference: intent.providerReference,
        type: 'payment.captured',
        amountMinor: '5249999',
      });

      await journey.handleCapture.execute(ctx.payments.parseWebhookEvent(corpo));

      expect(ctx.db.ledger).toHaveLength(0);
    });
  });
});
