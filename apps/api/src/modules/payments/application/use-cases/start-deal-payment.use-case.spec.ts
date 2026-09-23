import { beforeEach, describe, expect, it } from 'vitest';
import { ResourceConflictError } from '@/core/errors/domain-error';
import {
  DealNotFoundError,
  InvalidDealTransitionError,
  NotDealBuyerError,
} from '@/modules/deals/domain/errors';
import { makeJourney } from '@/shared/testing/deal-journey';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';

const TELEFONE = '+244923000000';

describe('StartDealPaymentUseCase', () => {
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
    it('emite uma intenção pelo valor exacto do pedido', async () => {
      const porPagar = await journey.advanceTo('PROPOSED');

      const { intent, replayed } = await journey.startPayment.execute({
        actorUserId: 'buyer',
        dealId: porPagar.id,
        payerPhone: TELEFONE,
        idempotencyKey: 'chave-1',
      });

      // O comprador paga o preço mais a sua metade da taxa: 50 000 + 2 500 Kz.
      expect(intent.amountMinor).toBe(5_250_000n);
      expect(intent.currency).toBe('AOA');
      expect(intent.status).toBe('PENDING');
      expect(replayed).toBe(false);
    });

    it('não move o dinheiro só por emitir a intenção', async () => {
      const porPagar = await journey.advanceTo('PROPOSED');

      await journey.startPayment.execute({
        actorUserId: 'buyer',
        dealId: porPagar.id,
        payerPhone: TELEFONE,
        idempotencyKey: 'chave-1',
      });

      const deal = await ctx.deals.findById(porPagar.id);

      expect(deal!.status).toBe('PROPOSED');
      expect(deal!.escrowStatus).toBe('PENDING');
      expect(ctx.db.ledger).toHaveLength(0);
    });

    it('escreve auditoria com a referência do parceiro', async () => {
      const porPagar = await journey.advanceTo('PROPOSED');

      const { intent } = await journey.startPayment.execute({
        actorUserId: 'buyer',
        dealId: porPagar.id,
        payerPhone: TELEFONE,
        idempotencyKey: 'chave-1',
      });

      expect(ctx.db.auditLog).toContainEqual(
        expect.objectContaining({
          action: 'payment.intent_created',
          metadata: { providerReference: intent.providerReference },
        }),
      );
    });
  });

  describe('idempotência (RN-090)', () => {
    it('repetir a mesma chave devolve a intenção existente sem criar outra', async () => {
      const porPagar = await journey.advanceTo('PROPOSED');

      const primeira = await journey.startPayment.execute({
        actorUserId: 'buyer',
        dealId: porPagar.id,
        payerPhone: TELEFONE,
        idempotencyKey: 'chave-1',
      });

      const segunda = await journey.startPayment.execute({
        actorUserId: 'buyer',
        dealId: porPagar.id,
        payerPhone: TELEFONE,
        idempotencyKey: 'chave-1',
      });

      expect(segunda.intent.id).toBe(primeira.intent.id);
      expect(segunda.replayed).toBe(true);
      expect(ctx.db.paymentIntents.size).toBe(1);
    });

    it('recusa uma segunda intenção com chave diferente enquanto há uma activa (RN-092)', async () => {
      const porPagar = await journey.advanceTo('PROPOSED');

      await journey.startPayment.execute({
        actorUserId: 'buyer',
        dealId: porPagar.id,
        payerPhone: TELEFONE,
        idempotencyKey: 'chave-1',
      });

      await expect(
        journey.startPayment.execute({
          actorUserId: 'buyer',
          dealId: porPagar.id,
          payerPhone: TELEFONE,
          idempotencyKey: 'chave-2',
        }),
      ).rejects.toThrowError(ResourceConflictError);

      expect(ctx.db.paymentIntents.size).toBe(1);
    });
  });

  describe('caminhos de erro', () => {
    it('recusa pagar duas vezes o mesmo pedido', async () => {
      const pago = await journey.advanceTo('PAGO');

      await expect(
        journey.startPayment.execute({
          actorUserId: 'buyer',
          dealId: pago.id,
          payerPhone: TELEFONE,
          idempotencyKey: 'chave-nova',
        }),
      ).rejects.toThrowError(ResourceConflictError);
    });

    it('recusa pagar um pedido que o criador já aceitou', async () => {
      const aceite = await journey.advanceTo('ACCEPTED');

      await expect(
        journey.startPayment.execute({
          actorUserId: 'buyer',
          dealId: aceite.id,
          payerPhone: TELEFONE,
          idempotencyKey: 'chave-nova',
        }),
      ).rejects.toThrowError(InvalidDealTransitionError);
    });

    it('um terceiro não encontra o pedido (RN-063)', async () => {
      const porPagar = await journey.advanceTo('PROPOSED');
      ctx.seedUser({ id: 'estranho' });

      await expect(
        journey.startPayment.execute({
          actorUserId: 'estranho',
          dealId: porPagar.id,
          payerPhone: TELEFONE,
          idempotencyKey: 'chave-1',
        }),
      ).rejects.toThrowError(DealNotFoundError);
    });

    it('o criador é parte, mas não é ele quem paga — 403 e não 404', async () => {
      const porPagar = await journey.advanceTo('PROPOSED');

      await expect(
        journey.startPayment.execute({
          actorUserId: 'creator',
          dealId: porPagar.id,
          payerPhone: TELEFONE,
          idempotencyKey: 'chave-1',
        }),
      ).rejects.toThrowError(NotDealBuyerError);
    });

    it('regista a intenção como recusada quando o parceiro recusa a autorização', async () => {
      const porPagar = await journey.advanceTo('PROPOSED');

      // O número terminado em 11 provoca recusa no gateway falso.
      const { intent } = await journey.startPayment.execute({
        actorUserId: 'buyer',
        dealId: porPagar.id,
        payerPhone: '+244900000011',
        idempotencyKey: 'chave-1',
      });

      expect(intent.status).toBe('FAILED');

      const deal = await ctx.deals.findById(porPagar.id);
      expect(deal!.status).toBe('PROPOSED');
      expect(deal!.escrowStatus).toBe('PENDING');
    });
  });
});
