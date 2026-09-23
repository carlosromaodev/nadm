import { beforeEach, describe, expect, it } from 'vitest';
import { Money } from '@/shared/domain/money';
import { makeJourney } from '@/shared/testing/deal-journey';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';
import type { Deal } from '../../domain/deal';
import { STATE_CHANGE_BODY } from '../../domain/message';
import { refundReference } from './escrow-refund';

/** A janela de resposta do criador semeada no contexto de teste. */
const PRAZO_DE_RESPOSTA_HORAS = 48;
/** A janela de aprovação do comprador, findo o qual T10 aprova por ele. */
const PRAZO_DE_APROVACAO_HORAS = 72;

describe('RunDealDeadlinesUseCase', () => {
  let ctx: TestContext;
  let journey: ReturnType<typeof makeJourney>;

  beforeEach(() => {
    ctx = makeTestContext();
    journey = makeJourney(ctx);

    ctx.seedUser({ id: 'buyer' });
    ctx.seedCreator({ id: 'creator', handle: 'nelsonbeats' });
    ctx.seedOffer({ id: 'offer-1', profileId: 'profile-creator' });
  });

  describe('T13 · a proposta expira sem resposta do criador', () => {
    it('expira um pedido pago e devolve o dinheiro (T13 + E3)', async () => {
      const pago = await journey.advanceTo('PAGO');

      ctx.clock.advanceHours(PRAZO_DE_RESPOSTA_HORAS);

      const resultado = await journey.runDeadlines.execute();

      expect(resultado.expired).toBe(1);

      const deal = await ctx.deals.findById(pago.id);
      expect(deal?.status).toBe('EXPIRED');
      expect(deal?.escrowStatus).toBe('REFUNDED');
    });

    it('o estorno soma zero e deixa o escrow do pedido a zero (RN-100)', async () => {
      const pago = await journey.advanceTo('PAGO');
      ctx.clock.advanceHours(PRAZO_DE_RESPOSTA_HORAS);

      await journey.runDeadlines.execute();

      const estorno = ctx.db.ledger.find((t) => t.kind === 'ESCROW_REFUND')!;
      const soma = estorno.entries.reduce(
        (total, entrada) => total.add(entrada.signedAmount),
        Money.zero(),
      );

      expect(soma.isZero).toBe(true);
      expect((await ctx.ledger.balanceOf('ESCROW', pago.id)).isZero).toBe(true);
      expect(
        await ctx.ledger.existsByExternalReference('ESCROW_REFUND', refundReference(pago.id)),
      ).toBe(true);
    });

    it('expira um pedido nunca pago sem lançar nada no razão (E4)', async () => {
      const porPagar = await journey.advanceTo('PROPOSED');
      ctx.clock.advanceHours(PRAZO_DE_RESPOSTA_HORAS);

      await journey.runDeadlines.execute();

      const deal = await ctx.deals.findById(porPagar.id);
      expect(deal?.status).toBe('EXPIRED');
      expect(deal?.escrowStatus).toBe('FAILED');
      expect(ctx.db.ledger).toHaveLength(0);
    });

    it('fecha a intenção de pagamento que tinha ficado viva', async () => {
      const deal = await journey.advanceTo('PROPOSED');

      await journey.startPayment.execute({
        actorUserId: 'buyer',
        dealId: deal.id,
        payerPhone: '+244923000000',
        idempotencyKey: `pay-${deal.id}`,
      });

      ctx.clock.advanceHours(PRAZO_DE_RESPOSTA_HORAS);
      await journey.runDeadlines.execute();

      expect(await ctx.paymentIntents.findActiveByDeal(deal.id)).toBeNull();
    });

    it('não toca num pedido ainda dentro do prazo', async () => {
      const pago = await journey.advanceTo('PAGO');

      ctx.clock.advanceHours(PRAZO_DE_RESPOSTA_HORAS - 1);

      const resultado = await journey.runDeadlines.execute();

      expect(resultado.expired).toBe(0);
      expect((await ctx.deals.findById(pago.id))?.status).toBe('PROPOSED');
    });

    it('não expira um pedido que o criador aceitou entretanto', async () => {
      const aceite = await journey.advanceTo('ACCEPTED');

      ctx.clock.advanceHours(PRAZO_DE_RESPOSTA_HORAS);

      const resultado = await journey.runDeadlines.execute();

      expect(resultado.expired).toBe(0);
      expect((await ctx.deals.findById(aceite.id))?.status).toBe('ACCEPTED');
    });

    it('regista a expiração na conversa e na auditoria, como acto do sistema', async () => {
      const pago = await journey.advanceTo('PAGO');
      ctx.clock.advanceHours(PRAZO_DE_RESPOSTA_HORAS);

      await journey.runDeadlines.execute();

      const conversa = await ctx.messages.listByDeal(pago.id, 50);
      expect(conversa.some((m) => m.body === STATE_CHANGE_BODY.EXPIRED)).toBe(true);
      expect(conversa.some((m) => m.body === STATE_CHANGE_BODY.REFUNDED)).toBe(true);

      const registo = ctx.db.auditLog.find((entry) => entry.action === 'deal.expired');
      expect(registo?.actorKind).toBe('SYSTEM');
      expect(registo?.actorUserId).toBeNull();
    });
  });

  describe('T10 · a entrega é aprovada por falta de resposta', () => {
    it('aprova e liberta o dinheiro ao fim da janela de aprovação', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      ctx.clock.advanceHours(PRAZO_DE_APROVACAO_HORAS);

      const resultado = await journey.runDeadlines.execute();

      expect(resultado.autoApproved).toBe(1);

      const deal = await ctx.deals.findById(entregue.id);
      expect(deal?.status).toBe('PAID');
      expect(deal?.escrowStatus).toBe('RELEASED');
    });

    it('o criador recebe exactamente o líquido, como se o comprador tivesse aprovado', async () => {
      await journey.advanceTo('DELIVERED');
      ctx.clock.advanceHours(PRAZO_DE_APROVACAO_HORAS);

      await journey.runDeadlines.execute();

      const carteira = await ctx.wallets.recomputeFromLedger('profile-creator', ctx.clock.now());
      expect(carteira.available.amountMinor).toBe(4_750_000n);
    });

    it('a auditoria diz que foi o sistema, e a conversa diz que foi automático', async () => {
      const entregue = await journey.advanceTo('DELIVERED');
      ctx.clock.advanceHours(PRAZO_DE_APROVACAO_HORAS);

      await journey.runDeadlines.execute();

      const registo = ctx.db.auditLog.find((e) => e.action === 'delivery.auto_approved');
      expect(registo?.actorKind).toBe('SYSTEM');
      expect(registo?.actorUserId).toBeNull();

      const conversa = await ctx.messages.listByDeal(entregue.id, 50);
      expect(conversa.some((m) => m.body === STATE_CHANGE_BODY.AUTO_APPROVED)).toBe(true);
      expect(conversa.some((m) => m.body === STATE_CHANGE_BODY.APPROVED)).toBe(false);
    });

    it('não aprova antes de a janela fechar', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      ctx.clock.advanceHours(PRAZO_DE_APROVACAO_HORAS - 1);

      const resultado = await journey.runDeadlines.execute();

      expect(resultado.autoApproved).toBe(0);
      expect((await ctx.deals.findById(entregue.id))?.status).toBe('DELIVERED');
    });

    it('uma entrega rejeitada deixa de ser candidata: o relógio recomeça', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await journey.rejectDelivery.execute({
        actorUserId: 'buyer',
        dealId: entregue.id,
        reason: 'O nome está mal pronunciado.',
      });

      ctx.clock.advanceHours(PRAZO_DE_APROVACAO_HORAS);

      const resultado = await journey.runDeadlines.execute();

      expect(resultado.autoApproved).toBe(0);
      expect((await ctx.deals.findById(entregue.id))?.status).toBe('IN_PROGRESS');
    });
  });

  describe('o varrimento é retomável', () => {
    it('correr duas vezes não duplica estornos nem libertações (RN-104)', async () => {
      await journey.advanceTo('PAGO');
      ctx.clock.advanceHours(PRAZO_DE_RESPOSTA_HORAS);

      await journey.runDeadlines.execute();
      const segunda = await journey.runDeadlines.execute();

      expect(segunda.expired).toBe(0);
      expect(ctx.db.ledger.filter((t) => t.kind === 'ESCROW_REFUND')).toHaveLength(1);
    });

    it('trata os dois prazos no mesmo varrimento, sem se atrapalharem', async () => {
      const porDecidir = await journey.advanceTo('PAGO');
      const entregue = await journey.advanceTo('DELIVERED', { offerId: 'offer-1' });

      ctx.clock.advanceHours(PRAZO_DE_APROVACAO_HORAS);

      const resultado = await journey.runDeadlines.execute();

      expect(resultado).toEqual({ expired: 1, autoApproved: 1, failed: 0 });
      expect((await ctx.deals.findById(porDecidir.id))?.status).toBe('EXPIRED');
      expect((await ctx.deals.findById(entregue.id))?.status).toBe('PAID');
    });

    it('um pedido que falha não impede os outros de serem tratados', async () => {
      const bom = await journey.advanceTo('PAGO');
      const mau = await journey.advanceTo('PAGO');

      ctx.clock.advanceHours(PRAZO_DE_RESPOSTA_HORAS);

      // Sabota só um: gravar este `Deal` passa a rebentar.
      const save = ctx.deals.save.bind(ctx.deals);
      ctx.deals.save = async (deal: Deal) => {
        if (deal.id === mau.id) throw new Error('falha simulada de escrita');
        return save(deal);
      };

      const resultado = await journey.runDeadlines.execute();

      expect(resultado.expired).toBe(1);
      expect(resultado.failed).toBe(1);
      expect((await ctx.deals.findById(bom.id))?.status).toBe('EXPIRED');
    });
  });
});
