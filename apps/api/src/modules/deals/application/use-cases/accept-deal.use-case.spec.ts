import { beforeEach, describe, expect, it } from 'vitest';
import { makeJourney } from '@/shared/testing/deal-journey';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';
import {
  DealNotFoundError,
  DealProposalExpiredError,
  InvalidDealTransitionError,
  NotDealCreatorError,
} from '../../domain/errors';

describe('AcceptDealUseCase', () => {
  let ctx: TestContext;
  let journey: ReturnType<typeof makeJourney>;

  beforeEach(() => {
    ctx = makeTestContext({ proposalWindowHours: 48 });
    journey = makeJourney(ctx);

    ctx.seedUser({ id: 'buyer' });
    ctx.seedCreator({ id: 'creator', handle: 'nelsonbeats' });
    ctx.seedOffer({ id: 'offer-1', profileId: 'profile-creator' });
  });

  describe('caminho normal', () => {
    it('move o pedido para ACCEPTED com o dinheiro já retido', async () => {
      const pago = await journey.advanceTo('PAGO');

      const deal = await journey.acceptDeal.execute({
        actorUserId: 'creator',
        dealId: pago.id,
      });

      expect(deal.status).toBe('ACCEPTED');
      expect(deal.escrowStatus).toBe('HELD');
      expect(deal.toProps().acceptedAt).toEqual(ctx.clock.now());
      // Aceitar é o que arranca o prazo de entrega.
      expect(deal.toProps().dueAt).not.toBeNull();
    });

    it('escreve a transição na conversa (RN-049)', async () => {
      const pago = await journey.advanceTo('PAGO');

      await journey.acceptDeal.execute({ actorUserId: 'creator', dealId: pago.id });

      const conversa = await ctx.messages.listByDeal(pago.id, 10);

      expect(conversa.at(-1)).toMatchObject({
        kind: 'STATE_CHANGE',
        body: expect.stringContaining('prazo de entrega começou'),
      });
    });

    it('avisa o comprador de que o criador aceitou', async () => {
      const pago = await journey.advanceTo('PAGO');

      await journey.acceptDeal.execute({ actorUserId: 'creator', dealId: pago.id });

      expect(ctx.db.outbox).toContainEqual(
        expect.objectContaining({
          type: 'deal.accepted',
          payload: expect.objectContaining({ buyerUserId: 'buyer' }),
        }),
      );
    });

    it('escreve auditoria', async () => {
      const pago = await journey.advanceTo('PAGO');

      await journey.acceptDeal.execute({ actorUserId: 'creator', dealId: pago.id });

      expect(ctx.db.auditLog).toContainEqual(
        expect.objectContaining({ action: 'deal.accepted', actorUserId: 'creator' }),
      );
    });
  });

  describe('caminhos de erro', () => {
    it('recusa aceitar duas vezes', async () => {
      const pago = await journey.advanceTo('PAGO');

      await journey.acceptDeal.execute({ actorUserId: 'creator', dealId: pago.id });

      await expect(
        journey.acceptDeal.execute({ actorUserId: 'creator', dealId: pago.id }),
      ).rejects.toThrowError(InvalidDealTransitionError);
    });

    it('recusa aceitar uma proposta cujo prazo passou', async () => {
      const pago = await journey.advanceTo('PAGO');

      ctx.clock.advanceHours(49);

      await expect(
        journey.acceptDeal.execute({ actorUserId: 'creator', dealId: pago.id }),
      ).rejects.toThrowError(DealProposalExpiredError);

      const guardado = await ctx.deals.findById(pago.id);
      expect(guardado!.status).toBe('PROPOSED');
    });

    it('aceita no último momento antes de o prazo fechar', async () => {
      const pago = await journey.advanceTo('PAGO');

      ctx.clock.advanceHours(47);

      const deal = await journey.acceptDeal.execute({
        actorUserId: 'creator',
        dealId: pago.id,
      });

      expect(deal.status).toBe('ACCEPTED');
    });

    it('um terceiro não encontra o pedido (RN-063)', async () => {
      const pago = await journey.advanceTo('PAGO');
      ctx.seedUser({ id: 'estranho' });

      await expect(
        journey.acceptDeal.execute({ actorUserId: 'estranho', dealId: pago.id }),
      ).rejects.toThrowError(DealNotFoundError);
    });

    it('o comprador é parte, mas não é ele quem aceita — 403 e não 404', async () => {
      const pago = await journey.advanceTo('PAGO');

      await expect(
        journey.acceptDeal.execute({ actorUserId: 'buyer', dealId: pago.id }),
      ).rejects.toThrowError(NotDealCreatorError);
    });

    it('nada se escreve na conversa quando a aceitação falha', async () => {
      const pago = await journey.advanceTo('PAGO');
      const antes = (await ctx.messages.listByDeal(pago.id, 50)).length;

      await expect(
        journey.acceptDeal.execute({ actorUserId: 'buyer', dealId: pago.id }),
      ).rejects.toThrow();

      expect(await ctx.messages.listByDeal(pago.id, 50)).toHaveLength(antes);
    });
  });
});
