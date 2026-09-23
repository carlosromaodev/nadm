import { beforeEach, describe, expect, it } from 'vitest';
import { ResourceConflictError } from '@/core/errors/domain-error';
import { makeJourney } from '@/shared/testing/deal-journey';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';
import {
  DealNotFoundError,
  InvalidDealTransitionError,
  NotDealBuyerError,
  RejectionReasonRequiredError,
  RevisionsExhaustedError,
} from '../../domain/errors';
import { STATE_CHANGE_BODY } from '../../domain/message';

const MOTIVO = 'O nome da minha irmã está mal pronunciado no vídeo.';

describe('RejectDeliveryUseCase', () => {
  let ctx: TestContext;
  let journey: ReturnType<typeof makeJourney>;

  beforeEach(() => {
    ctx = makeTestContext();
    journey = makeJourney(ctx);

    ctx.seedUser({ id: 'buyer' });
    ctx.seedUser({ id: 'estranho' });
    ctx.seedCreator({ id: 'creator', handle: 'nelsonbeats' });
    ctx.seedOffer({ id: 'offer-1', profileId: 'profile-creator', revisionsIncluded: 1 });
  });

  describe('caminho normal', () => {
    it('devolve o trabalho ao criador e consome uma revisão (T11, RN-044)', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      const { deal } = await journey.rejectDelivery.execute({
        actorUserId: 'buyer',
        dealId: entregue.id,
        reason: MOTIVO,
        expectedVersion: 1,
      });

      expect(deal.status).toBe('IN_PROGRESS');
      expect(deal.revisionCount).toBe(1);
      expect(deal.revisionsRemaining).toBe(0);
    });

    it('abre prazo novo contado a partir da rejeição, não do prazo antigo', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      ctx.clock.advanceHours(10);
      const rejeitadoEm = ctx.clock.now();

      const { deal } = await journey.rejectDelivery.execute({
        actorUserId: 'buyer',
        dealId: entregue.id,
        reason: MOTIVO,
      });

      // A oferta semeada tem 48 h de SLA.
      expect(deal.dueAt?.toISOString()).toBe(
        new Date(rejeitadoEm.getTime() + 48 * 60 * 60 * 1000).toISOString(),
      );
      expect(deal.deliveredAt).toBeNull();
    });

    it('o dinheiro não se mexe: continua retido, que é para isto que lá está', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      const { deal } = await journey.rejectDelivery.execute({
        actorUserId: 'buyer',
        dealId: entregue.id,
        reason: MOTIVO,
      });

      expect(deal.escrowStatus).toBe('HELD');
      expect(ctx.db.ledger.map((t) => t.kind)).toEqual(['ESCROW_FUNDING']);
    });

    it('marca a entrega como rejeitada, com o motivo', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await journey.rejectDelivery.execute({
        actorUserId: 'buyer',
        dealId: entregue.id,
        reason: MOTIVO,
      });

      const entrega = await ctx.deliveries.findLatest(entregue.id);

      expect(entrega?.rejectedAt).not.toBeNull();
      expect(entrega?.rejectionReason).toBe(MOTIVO);
      expect(entrega?.acceptedAt).toBeNull();
    });

    it('escreve o motivo e a mudança de estado na conversa (RN-049)', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await journey.rejectDelivery.execute({
        actorUserId: 'buyer',
        dealId: entregue.id,
        reason: MOTIVO,
      });

      const conversa = await ctx.messages.listByDeal(entregue.id, 50);

      expect(conversa.some((m) => m.kind === 'TEXT' && m.body === MOTIVO)).toBe(true);
      expect(conversa.some((m) => m.body === STATE_CHANGE_BODY.DELIVERY_REJECTED)).toBe(true);
    });

    it('o criador entrega de novo, e a versão seguinte é a 2', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await journey.rejectDelivery.execute({
        actorUserId: 'buyer',
        dealId: entregue.id,
        reason: MOTIVO,
      });

      const { delivery } = await journey.submitDelivery.execute({
        actorUserId: 'creator',
        dealId: entregue.id,
        note: 'Corrigi a pronúncia do nome.',
      });

      expect(delivery.version).toBe(2);
    });
  });

  describe('autorização', () => {
    it('devolve 404 a quem não é parte do pedido (RN-063)', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await expect(
        journey.rejectDelivery.execute({
          actorUserId: 'estranho',
          dealId: entregue.id,
          reason: MOTIVO,
        }),
      ).rejects.toThrow(DealNotFoundError);
    });

    it('rejeitar é do comprador: ao criador devolve 403', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await expect(
        journey.rejectDelivery.execute({
          actorUserId: 'creator',
          dealId: entregue.id,
          reason: MOTIVO,
        }),
      ).rejects.toThrow(NotDealBuyerError);
    });
  });

  describe('caminhos de erro', () => {
    it('exige motivo: sem ele o criador não sabe o que corrigir', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await expect(
        journey.rejectDelivery.execute({
          actorUserId: 'buyer',
          dealId: entregue.id,
          reason: '   ',
        }),
      ).rejects.toThrow(RejectionReasonRequiredError);
    });

    it('esgotadas as revisões, recusa e a entrega não fica marcada (RN-044)', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await journey.rejectDelivery.execute({
        actorUserId: 'buyer',
        dealId: entregue.id,
        reason: MOTIVO,
      });

      await journey.submitDelivery.execute({
        actorUserId: 'creator',
        dealId: entregue.id,
        note: 'Corrigi a pronúncia do nome.',
      });

      await expect(
        journey.rejectDelivery.execute({
          actorUserId: 'buyer',
          dealId: entregue.id,
          reason: 'Continua mal.',
        }),
      ).rejects.toThrow(RevisionsExhaustedError);

      const segunda = await ctx.deliveries.findLatest(entregue.id);
      expect(segunda?.version).toBe(2);
      expect(segunda?.rejectedAt).toBeNull();

      const deal = await ctx.deals.findById(entregue.id);
      expect(deal?.status).toBe('DELIVERED');
      expect(deal?.revisionCount).toBe(1);
    });

    it('não rejeita um pedido que ainda não foi entregue', async () => {
      const aceite = await journey.advanceTo('ACCEPTED');

      await expect(
        journey.rejectDelivery.execute({
          actorUserId: 'buyer',
          dealId: aceite.id,
          reason: MOTIVO,
        }),
      ).rejects.toThrow(InvalidDealTransitionError);
    });

    it('não rejeita uma versão que já não é a mais recente', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await expect(
        journey.rejectDelivery.execute({
          actorUserId: 'buyer',
          dealId: entregue.id,
          reason: MOTIVO,
          expectedVersion: 2,
        }),
      ).rejects.toThrow(ResourceConflictError);

      expect((await ctx.deals.findById(entregue.id))?.status).toBe('DELIVERED');
    });
  });
});
