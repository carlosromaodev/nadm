import { beforeEach, describe, expect, it } from 'vitest';
import { Money } from '@/shared/domain/money';
import { makeJourney } from '@/shared/testing/deal-journey';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';
import {
  DealNotFoundError,
  NotDealBuyerError,
  RefundNotDueError,
} from '../../domain/errors';
import { STATE_CHANGE_BODY } from '../../domain/message';
import { refundReference } from './escrow-refund';

/** SLA de 48 h mais 48 h de tolerância: o direito nasce à 96.ª hora. */
const ATE_AO_DIREITO_HORAS = 48 + 48;

describe('RequestRefundUseCase', () => {
  let ctx: TestContext;
  let journey: ReturnType<typeof makeJourney>;

  beforeEach(() => {
    ctx = makeTestContext();
    journey = makeJourney(ctx);

    ctx.seedUser({ id: 'buyer' });
    ctx.seedUser({ id: 'estranho' });
    ctx.seedCreator({ id: 'creator', handle: 'nelsonbeats' });
    ctx.seedOffer({ id: 'offer-1', profileId: 'profile-creator', slaHours: 48 });
  });

  describe('caminho normal', () => {
    it('devolve o dinheiro quando o prazo foi ultrapassado (T16 + E3)', async () => {
      const aceite = await journey.advanceTo('ACCEPTED');

      ctx.clock.advanceHours(ATE_AO_DIREITO_HORAS);

      const deal = await journey.requestRefund.execute({
        actorUserId: 'buyer',
        dealId: aceite.id,
      });

      expect(deal.status).toBe('REFUNDED');
      expect(deal.escrowStatus).toBe('REFUNDED');
    });

    it('o estorno soma zero e deixa o escrow do pedido a zero (RN-100)', async () => {
      const aceite = await journey.advanceTo('ACCEPTED');
      ctx.clock.advanceHours(ATE_AO_DIREITO_HORAS);

      await journey.requestRefund.execute({ actorUserId: 'buyer', dealId: aceite.id });

      const estorno = ctx.db.ledger.find((t) => t.kind === 'ESCROW_REFUND')!;
      const soma = estorno.entries.reduce(
        (total, entrada) => total.add(entrada.signedAmount),
        Money.zero(),
      );

      expect(soma.isZero).toBe(true);
      expect((await ctx.ledger.balanceOf('ESCROW', aceite.id)).isZero).toBe(true);
    });

    it('o criador não recebe nada por um trabalho que não entregou', async () => {
      const aceite = await journey.advanceTo('ACCEPTED');
      ctx.clock.advanceHours(ATE_AO_DIREITO_HORAS);

      await journey.requestRefund.execute({ actorUserId: 'buyer', dealId: aceite.id });

      const carteira = await ctx.wallets.findByProfile('profile-creator');
      expect(carteira?.available.isZero).toBe(true);
    });

    it('conta a história na conversa: pedido de devolução e devolução (RN-049)', async () => {
      const aceite = await journey.advanceTo('ACCEPTED');
      ctx.clock.advanceHours(ATE_AO_DIREITO_HORAS);

      await journey.requestRefund.execute({ actorUserId: 'buyer', dealId: aceite.id });

      const conversa = await ctx.messages.listByDeal(aceite.id, 50);

      expect(conversa.some((m) => m.body === STATE_CHANGE_BODY.REFUND_REQUESTED)).toBe(true);
      expect(conversa.some((m) => m.body === STATE_CHANGE_BODY.REFUNDED)).toBe(true);
    });

    it('também devolve depois de uma entrega rejeitada, com o prazo novo ultrapassado', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await journey.rejectDelivery.execute({
        actorUserId: 'buyer',
        dealId: entregue.id,
        reason: 'O nome está mal pronunciado.',
      });

      ctx.clock.advanceHours(ATE_AO_DIREITO_HORAS);

      const deal = await journey.requestRefund.execute({
        actorUserId: 'buyer',
        dealId: entregue.id,
      });

      expect(deal.status).toBe('REFUNDED');
    });
  });

  describe('o direito nasce do tempo', () => {
    it('recusa enquanto o prazo de entrega ainda corre', async () => {
      const aceite = await journey.advanceTo('ACCEPTED');

      await expect(
        journey.requestRefund.execute({ actorUserId: 'buyer', dealId: aceite.id }),
      ).rejects.toThrow(RefundNotDueError);
    });

    it('recusa dentro da tolerância, com o prazo já passado mas não o suficiente', async () => {
      const aceite = await journey.advanceTo('ACCEPTED');

      ctx.clock.advanceHours(ATE_AO_DIREITO_HORAS - 1);

      await expect(
        journey.requestRefund.execute({ actorUserId: 'buyer', dealId: aceite.id }),
      ).rejects.toThrow(RefundNotDueError);

      expect(ctx.db.ledger.some((t) => t.kind === 'ESCROW_REFUND')).toBe(false);
    });

    it('um criador atrasado que entrega antes do pedido continua a receber', async () => {
      const aceite = await journey.advanceTo('ACCEPTED');

      ctx.clock.advanceHours(ATE_AO_DIREITO_HORAS);

      await journey.submitDelivery.execute({
        actorUserId: 'creator',
        dealId: aceite.id,
        note: 'Atrasei-me, mas aqui está.',
      });

      await expect(
        journey.requestRefund.execute({ actorUserId: 'buyer', dealId: aceite.id }),
      ).rejects.toThrow(RefundNotDueError);
    });
  });

  describe('autorização', () => {
    it('devolve 404 a quem não é parte do pedido (RN-063)', async () => {
      const aceite = await journey.advanceTo('ACCEPTED');
      ctx.clock.advanceHours(ATE_AO_DIREITO_HORAS);

      await expect(
        journey.requestRefund.execute({ actorUserId: 'estranho', dealId: aceite.id }),
      ).rejects.toThrow(DealNotFoundError);
    });

    it('pedir devolução é do comprador: ao criador devolve 403', async () => {
      const aceite = await journey.advanceTo('ACCEPTED');
      ctx.clock.advanceHours(ATE_AO_DIREITO_HORAS);

      await expect(
        journey.requestRefund.execute({ actorUserId: 'creator', dealId: aceite.id }),
      ).rejects.toThrow(NotDealBuyerError);
    });
  });

  describe('idempotência (RN-104)', () => {
    it('pedir duas vezes não lança dois estornos', async () => {
      const aceite = await journey.advanceTo('ACCEPTED');
      ctx.clock.advanceHours(ATE_AO_DIREITO_HORAS);

      await journey.requestRefund.execute({ actorUserId: 'buyer', dealId: aceite.id });

      await expect(
        journey.requestRefund.execute({ actorUserId: 'buyer', dealId: aceite.id }),
      ).rejects.toThrow(RefundNotDueError);

      expect(ctx.db.ledger.filter((t) => t.kind === 'ESCROW_REFUND')).toHaveLength(1);
      expect(
        await ctx.ledger.existsByExternalReference('ESCROW_REFUND', refundReference(aceite.id)),
      ).toBe(true);
    });

    it('um pedido já concluído não se devolve', async () => {
      const pago = await journey.advanceTo('PAID');
      ctx.clock.advanceHours(ATE_AO_DIREITO_HORAS);

      await expect(
        journey.requestRefund.execute({ actorUserId: 'buyer', dealId: pago.id }),
      ).rejects.toThrow(RefundNotDueError);
    });
  });
});
