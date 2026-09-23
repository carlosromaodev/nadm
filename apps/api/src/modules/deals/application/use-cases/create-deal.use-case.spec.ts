import { beforeEach, describe, expect, it } from 'vitest';
import { ResourceNotFoundError } from '@/core/errors/domain-error';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';
import { BriefRequiredError, OfferNotAvailableError, SelfDealError } from '../../domain/errors';
import { CreateDealUseCase } from './create-deal.use-case';

const BRIEF = 'Parabéns para a minha irmã Ana, faz 30 anos no sábado.';

describe('CreateDealUseCase', () => {
  let ctx: TestContext;
  let useCase: CreateDealUseCase;

  beforeEach(() => {
    ctx = makeTestContext();

    useCase = new CreateDealUseCase(
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

    ctx.seedUser({ id: 'buyer' });
    ctx.seedCreator({ id: 'creator', handle: 'nelsonbeats' });
    ctx.seedOffer({ id: 'offer-1', profileId: 'profile-creator' });
  });

  describe('caminho normal', () => {
    it('abre o pedido em PROPOSED com o dinheiro ainda por reter', async () => {
      const deal = await useCase.execute({
        actorUserId: 'buyer',
        offerId: 'offer-1',
        brief: BRIEF,
      });

      expect(deal.status).toBe('PROPOSED');
      expect(deal.escrowStatus).toBe('PENDING');
      expect(deal.reference).toMatch(/^NDM-2026-\d{7}$/);
    });

    it('persiste o pedido e liga-o às duas partes', async () => {
      const deal = await useCase.execute({
        actorUserId: 'buyer',
        offerId: 'offer-1',
        brief: BRIEF,
      });

      const guardado = await ctx.deals.findById(deal.id);

      expect(guardado).not.toBeNull();
      expect(guardado!.isBuyer('buyer')).toBe(true);
      expect(guardado!.isCreator('creator')).toBe(true);
    });

    it('abre a conversa com o pedido lá dentro — o brief é a primeira mensagem', async () => {
      const deal = await useCase.execute({
        actorUserId: 'buyer',
        offerId: 'offer-1',
        brief: BRIEF,
      });

      const conversa = await ctx.messages.listByDeal(deal.id, 10);

      expect(conversa).toHaveLength(2);
      expect(conversa[0]).toMatchObject({ kind: 'TEXT', senderUserId: 'buyer', body: BRIEF });
      expect(conversa[1]).toMatchObject({ kind: 'STATE_CHANGE', senderUserId: null });
    });

    it('reparte o valor entre criador e plataforma (RN-042)', async () => {
      const deal = await useCase.execute({
        actorUserId: 'buyer',
        offerId: 'offer-1',
        brief: BRIEF,
      });

      // 50 000 Kz anunciados: o comprador paga 52 500, o criador recebe 47 500.
      expect(deal.price.amountMinor).toBe(5_000_000n);
      expect(deal.amount.amountMinor).toBe(5_250_000n);
      expect(deal.creatorNet.amountMinor).toBe(4_750_000n);
      expect(deal.platformFee.amountMinor).toBe(500_000n);
      expect(deal.creatorNet.add(deal.platformFee).equals(deal.amount)).toBe(true);
    });

    it('congela os termos da oferta — mudar a oferta depois não mexe no pedido (RN-041)', async () => {
      const deal = await useCase.execute({
        actorUserId: 'buyer',
        offerId: 'offer-1',
        brief: BRIEF,
      });

      ctx.db.offers.set('offer-1', {
        ...ctx.db.offers.get('offer-1')!,
        priceMinor: 99_000_000n,
        slaHours: 1,
      });

      const guardado = await ctx.deals.findById(deal.id);

      expect(guardado!.amount.amountMinor).toBe(5_250_000n);
      expect(guardado!.offerSnapshot.slaHours).toBe(48);
    });

    it('usa a conta individual do comprador quando nenhuma é indicada', async () => {
      const deal = await useCase.execute({
        actorUserId: 'buyer',
        offerId: 'offer-1',
        brief: BRIEF,
      });

      expect(deal.toProps().buyerAccountId).toBe('account-buyer');
    });

    it('enfileira o evento de notificação na mesma operação', async () => {
      await useCase.execute({ actorUserId: 'buyer', offerId: 'offer-1', brief: BRIEF });

      expect(ctx.db.outbox).toHaveLength(1);
      expect(ctx.db.outbox[0].type).toBe('deal.created');
    });

    it('escreve auditoria', async () => {
      const deal = await useCase.execute({
        actorUserId: 'buyer',
        offerId: 'offer-1',
        brief: BRIEF,
      });

      expect(ctx.db.auditLog).toContainEqual(
        expect.objectContaining({
          action: 'deal.created',
          actorUserId: 'buyer',
          subjectType: 'Deal',
          subjectId: deal.id,
        }),
      );
    });

    it('dá referências diferentes a pedidos diferentes', async () => {
      const primeiro = await useCase.execute({
        actorUserId: 'buyer',
        offerId: 'offer-1',
        brief: BRIEF,
      });
      const segundo = await useCase.execute({
        actorUserId: 'buyer',
        offerId: 'offer-1',
        brief: BRIEF,
      });

      expect(primeiro.reference).not.toBe(segundo.reference);
    });
  });

  describe('caminhos de erro', () => {
    it('recusa uma oferta que não existe', async () => {
      await expect(
        useCase.execute({ actorUserId: 'buyer', offerId: 'nao-existe', brief: BRIEF }),
      ).rejects.toThrowError(ResourceNotFoundError);
    });

    it('recusa uma oferta arquivada (RN-032)', async () => {
      ctx.seedOffer({ id: 'offer-archived', profileId: 'profile-creator', status: 'ARCHIVED' });

      await expect(
        useCase.execute({ actorUserId: 'buyer', offerId: 'offer-archived', brief: BRIEF }),
      ).rejects.toThrowError(OfferNotAvailableError);
    });

    it('recusa um perfil em pausa', async () => {
      ctx.db.profiles.set('profile-creator', {
        ...ctx.db.profiles.get('profile-creator')!,
        availabilityStatus: 'PAUSED',
      });

      await expect(
        useCase.execute({ actorUserId: 'buyer', offerId: 'offer-1', brief: BRIEF }),
      ).rejects.toThrowError(OfferNotAvailableError);
    });

    it('recusa um perfil ainda não publicado', async () => {
      ctx.db.profiles.set('profile-creator', {
        ...ctx.db.profiles.get('profile-creator')!,
        publishedAt: null,
      });

      await expect(
        useCase.execute({ actorUserId: 'buyer', offerId: 'offer-1', brief: BRIEF }),
      ).rejects.toThrowError(OfferNotAvailableError);
    });

    it('recusa que o criador compre a si próprio (RN-040)', async () => {
      await expect(
        useCase.execute({ actorUserId: 'creator', offerId: 'offer-1', brief: BRIEF }),
      ).rejects.toThrowError(SelfDealError);
    });

    it('recusa um brief vazio quando a oferta o exige', async () => {
      await expect(
        useCase.execute({ actorUserId: 'buyer', offerId: 'offer-1', brief: '   ' }),
      ).rejects.toThrowError(BriefRequiredError);
    });

    it('recusa contratar em nome de uma conta que não é do comprador', async () => {
      ctx.seedUser({ id: 'outro' });

      await expect(
        useCase.execute({
          actorUserId: 'buyer',
          offerId: 'offer-1',
          brief: BRIEF,
          accountId: 'account-outro',
        }),
      ).rejects.toThrowError(ResourceNotFoundError);
    });

    it('nada fica escrito quando a criação falha', async () => {
      await expect(
        useCase.execute({ actorUserId: 'creator', offerId: 'offer-1', brief: BRIEF }),
      ).rejects.toThrow();

      expect(ctx.db.deals.size).toBe(0);
      expect(ctx.db.messages).toHaveLength(0);
      expect(ctx.db.outbox).toHaveLength(0);
    });
  });
});
