import { beforeEach, describe, expect, it } from 'vitest';
import { BusinessRuleError } from '@/core/errors/domain-error';
import { makeJourney } from '@/shared/testing/deal-journey';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';
import {
  DealNotFoundError,
  InvalidDealTransitionError,
  NotDealCreatorError,
} from '../../domain/errors';

const NOTA = 'Vídeo gravado e enviado. Espero que a Ana goste!';

describe('SubmitDeliveryUseCase', () => {
  let ctx: TestContext;
  let journey: ReturnType<typeof makeJourney>;

  beforeEach(() => {
    ctx = makeTestContext();
    journey = makeJourney(ctx);

    ctx.seedUser({ id: 'buyer' });
    ctx.seedCreator({ id: 'creator', handle: 'nelsonbeats' });
    ctx.seedOffer({ id: 'offer-1', profileId: 'profile-creator' });
  });

  describe('caminho normal', () => {
    it('move o pedido para DELIVERED e cria a primeira versão da entrega', async () => {
      const emCurso = await journey.advanceTo('ACCEPTED');

      const { deal, delivery } = await journey.submitDelivery.execute({
        actorUserId: 'creator',
        dealId: emCurso.id,
        note: NOTA,
      });

      expect(deal.status).toBe('DELIVERED');
      expect(delivery.version).toBe(1);
      expect(delivery.note).toBe(NOTA);
    });

    it('o dinheiro continua retido depois da entrega', async () => {
      const emCurso = await journey.advanceTo('ACCEPTED');

      const { deal } = await journey.submitDelivery.execute({
        actorUserId: 'creator',
        dealId: emCurso.id,
        note: NOTA,
      });

      expect(deal.escrowStatus).toBe('HELD');
      // O razão tem a captura (E1) e mais nada: entregar não liberta dinheiro.
      expect(ctx.db.ledger.map((t) => t.kind)).toEqual(['ESCROW_FUNDING']);
    });

    it('escreve a transição na conversa e avisa o comprador', async () => {
      const emCurso = await journey.advanceTo('ACCEPTED');

      await journey.submitDelivery.execute({
        actorUserId: 'creator',
        dealId: emCurso.id,
        note: NOTA,
      });

      const conversa = await ctx.messages.listByDeal(emCurso.id, 50);

      expect(conversa.at(-1)!.body).toBe('O criador submeteu a entrega.');
      expect(ctx.db.outbox.map((evento) => evento.type)).toContain('delivery.submitted');
    });

    it('remove espaço à volta da nota', async () => {
      const emCurso = await journey.advanceTo('ACCEPTED');

      const { delivery } = await journey.submitDelivery.execute({
        actorUserId: 'creator',
        dealId: emCurso.id,
        note: `   ${NOTA}   `,
      });

      expect(delivery.note).toBe(NOTA);
    });
  });

  describe('caminhos de erro', () => {
    it('recusa uma entrega sem nota nem ficheiro', async () => {
      const emCurso = await journey.advanceTo('ACCEPTED');

      await expect(
        journey.submitDelivery.execute({
          actorUserId: 'creator',
          dealId: emCurso.id,
          note: '   ',
        }),
      ).rejects.toThrowError(BusinessRuleError);
    });

    it('recusa entregar um pedido pago que o criador ainda não aceitou', async () => {
      const pago = await journey.advanceTo('PAGO');

      await expect(
        journey.submitDelivery.execute({
          actorUserId: 'creator',
          dealId: pago.id,
          note: NOTA,
        }),
      ).rejects.toThrowError(InvalidDealTransitionError);
    });

    it('recusa entregar duas vezes seguidas — a segunda versão exige rejeição primeiro', async () => {
      const emCurso = await journey.advanceTo('ACCEPTED');

      await journey.submitDelivery.execute({
        actorUserId: 'creator',
        dealId: emCurso.id,
        note: NOTA,
      });

      await expect(
        journey.submitDelivery.execute({
          actorUserId: 'creator',
          dealId: emCurso.id,
          note: NOTA,
        }),
      ).rejects.toThrowError(InvalidDealTransitionError);
    });

    it('um terceiro não encontra o pedido (RN-063)', async () => {
      const emCurso = await journey.advanceTo('ACCEPTED');
      ctx.seedUser({ id: 'estranho' });

      await expect(
        journey.submitDelivery.execute({
          actorUserId: 'estranho',
          dealId: emCurso.id,
          note: NOTA,
        }),
      ).rejects.toThrowError(DealNotFoundError);
    });

    it('o comprador é parte, mas não é ele quem entrega — 403 e não 404', async () => {
      const emCurso = await journey.advanceTo('ACCEPTED');

      await expect(
        journey.submitDelivery.execute({
          actorUserId: 'buyer',
          dealId: emCurso.id,
          note: NOTA,
        }),
      ).rejects.toThrowError(NotDealCreatorError);
    });

    it('nenhuma entrega fica registada quando a submissão falha', async () => {
      const emCurso = await journey.advanceTo('ACCEPTED');

      await expect(
        journey.submitDelivery.execute({
          actorUserId: 'buyer',
          dealId: emCurso.id,
          note: NOTA,
        }),
      ).rejects.toThrow();

      expect(await ctx.deliveries.listByDeal(emCurso.id)).toHaveLength(0);
    });
  });
});
