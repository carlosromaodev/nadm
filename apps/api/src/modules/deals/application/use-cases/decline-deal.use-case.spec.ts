import { beforeEach, describe, expect, it } from 'vitest';
import { Money } from '@/shared/domain/money';
import { makeJourney } from '@/shared/testing/deal-journey';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';
import { DealNotFoundError, InvalidDealTransitionError, NotDealCreatorError } from '../../domain/errors';
import { STATE_CHANGE_BODY } from '../../domain/message';
import { refundReference } from './escrow-refund';

describe('DeclineDealUseCase', () => {
  let ctx: TestContext;
  let journey: ReturnType<typeof makeJourney>;

  beforeEach(() => {
    ctx = makeTestContext();
    journey = makeJourney(ctx);

    ctx.seedUser({ id: 'buyer' });
    ctx.seedUser({ id: 'estranho' });
    ctx.seedCreator({ id: 'creator', handle: 'nelsonbeats' });
    ctx.seedOffer({ id: 'offer-1', profileId: 'profile-creator' });
  });

  describe('caminho normal', () => {
    it('recusa um pedido pago e devolve o dinheiro ao comprador (T3 + E3)', async () => {
      const pago = await journey.advanceTo('PAGO');

      const deal = await journey.declineDeal.execute({
        actorUserId: 'creator',
        dealId: pago.id,
        reason: 'Estou sem agenda este mês.',
      });

      expect(deal.status).toBe('DECLINED');
      expect(deal.escrowStatus).toBe('REFUNDED');
    });

    it('lança um estorno que soma zero e esvazia o escrow do pedido (RN-100)', async () => {
      const pago = await journey.advanceTo('PAGO');

      await journey.declineDeal.execute({ actorUserId: 'creator', dealId: pago.id });

      const estorno = ctx.db.ledger.find((t) => t.kind === 'ESCROW_REFUND');
      expect(estorno).toBeDefined();

      const soma = estorno!.entries.reduce(
        (total, entrada) => total.add(entrada.signedAmount),
        Money.zero(),
      );
      expect(soma.isZero).toBe(true);

      expect((await ctx.ledger.balanceOf('ESCROW', pago.id)).isZero).toBe(true);
      expect(await ctx.ledger.balanceOf('REFUNDS_PAYABLE', pago.id)).toEqual(
        Money.zero().subtract(pago.amount),
      );
    });

    it('não credita nada ao criador: um pedido recusado não paga trabalho nenhum', async () => {
      const pago = await journey.advanceTo('PAGO');

      await journey.declineDeal.execute({ actorUserId: 'creator', dealId: pago.id });

      const carteira = await ctx.wallets.findByProfile('profile-creator');
      expect(carteira?.available.isZero).toBe(true);
      expect(
        (await ctx.ledger.balanceOf('PLATFORM_FEE_REVENUE', pago.creatorProfileId)).isZero,
      ).toBe(true);
    });

    it('escreve o motivo e a mudança de estado na conversa (RN-049)', async () => {
      const pago = await journey.advanceTo('PAGO');

      await journey.declineDeal.execute({
        actorUserId: 'creator',
        dealId: pago.id,
        reason: 'Estou sem agenda este mês.',
      });

      const conversa = await ctx.messages.listByDeal(pago.id, 50);

      expect(conversa.some((m) => m.kind === 'TEXT' && m.body === 'Estou sem agenda este mês.')).toBe(true);
      expect(conversa.some((m) => m.body === STATE_CHANGE_BODY.DECLINED)).toBe(true);
      expect(conversa.some((m) => m.body === STATE_CHANGE_BODY.REFUNDED)).toBe(true);
    });

    it('recusa um pedido nunca pago sem lançar nada no razão (E4)', async () => {
      const porPagar = await journey.advanceTo('PROPOSED');

      const deal = await journey.declineDeal.execute({
        actorUserId: 'creator',
        dealId: porPagar.id,
      });

      expect(deal.status).toBe('DECLINED');
      expect(deal.escrowStatus).toBe('FAILED');
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

      await journey.declineDeal.execute({ actorUserId: 'creator', dealId: deal.id });

      expect(await ctx.paymentIntents.findActiveByDeal(deal.id)).toBeNull();
    });
  });

  describe('autorização', () => {
    it('devolve 404 a quem não é parte do pedido (RN-063)', async () => {
      const pago = await journey.advanceTo('PAGO');

      await expect(
        journey.declineDeal.execute({ actorUserId: 'estranho', dealId: pago.id }),
      ).rejects.toThrow(DealNotFoundError);
    });

    it('recusar é do criador: ao comprador devolve 403', async () => {
      const pago = await journey.advanceTo('PAGO');

      await expect(
        journey.declineDeal.execute({ actorUserId: 'buyer', dealId: pago.id }),
      ).rejects.toThrow(NotDealCreatorError);
    });
  });

  describe('caminhos de erro', () => {
    it('não recusa um pedido já aceite', async () => {
      const aceite = await journey.advanceTo('ACCEPTED');

      await expect(
        journey.declineDeal.execute({ actorUserId: 'creator', dealId: aceite.id }),
      ).rejects.toThrow(InvalidDealTransitionError);
    });

    it('não recusa duas vezes, e o estorno não se repete (RN-104)', async () => {
      const pago = await journey.advanceTo('PAGO');

      await journey.declineDeal.execute({ actorUserId: 'creator', dealId: pago.id });

      await expect(
        journey.declineDeal.execute({ actorUserId: 'creator', dealId: pago.id }),
      ).rejects.toThrow(InvalidDealTransitionError);

      expect(ctx.db.ledger.filter((t) => t.kind === 'ESCROW_REFUND')).toHaveLength(1);
    });

    it('a chave semântica do estorno é a do pedido, e é única', async () => {
      const pago = await journey.advanceTo('PAGO');

      await journey.declineDeal.execute({ actorUserId: 'creator', dealId: pago.id });

      expect(
        await ctx.ledger.existsByExternalReference('ESCROW_REFUND', refundReference(pago.id)),
      ).toBe(true);
    });
  });
});
