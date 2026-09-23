import { beforeEach, describe, expect, it } from 'vitest';
import { makeJourney } from '@/shared/testing/deal-journey';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';
import { ConversationClosedError, DealNotFoundError } from '../../domain/errors';
import { SendMessageUseCase } from './send-message.use-case';

describe('SendMessageUseCase', () => {
  let ctx: TestContext;
  let journey: ReturnType<typeof makeJourney>;
  let useCase: SendMessageUseCase;

  beforeEach(() => {
    ctx = makeTestContext();
    journey = makeJourney(ctx);

    useCase = new SendMessageUseCase(
      ctx.transactions,
      ctx.deals,
      ctx.messages,
      ctx.outbox,
      ctx.ids,
      ctx.clock,
    );

    ctx.seedUser({ id: 'buyer' });
    ctx.seedCreator({ id: 'creator', handle: 'nelsonbeats' });
    ctx.seedOffer({ id: 'offer-1', profileId: 'profile-creator' });
  });

  describe('caminho normal', () => {
    it('as duas partes escrevem na mesma conversa', async () => {
      const deal = await journey.advanceTo('ACCEPTED');

      await useCase.execute({
        actorUserId: 'buyer',
        dealId: deal.id,
        body: 'Consegues entregar antes de sábado?',
        clientId: null,
      });

      await useCase.execute({
        actorUserId: 'creator',
        dealId: deal.id,
        body: 'Consigo, sim.',
        clientId: null,
      });

      const conversa = await ctx.messages.listByDeal(deal.id, 50);
      const texto = conversa.filter((mensagem) => mensagem.kind === 'TEXT');

      expect(texto.map((mensagem) => mensagem.senderUserId)).toEqual([
        'buyer',
        'buyer',
        'creator',
      ]);
    });

    it('a conversa mistura mensagens de pessoas e transições do sistema', async () => {
      const deal = await journey.advanceTo('ACCEPTED');

      await useCase.execute({
        actorUserId: 'buyer',
        dealId: deal.id,
        body: 'Obrigado!',
        clientId: null,
      });

      const tipos = (await ctx.messages.listByDeal(deal.id, 50)).map(
        (mensagem) => mensagem.kind,
      );

      expect(tipos).toContain('TEXT');
      expect(tipos).toContain('STATE_CHANGE');
    });

    it('avisa a outra parte, nunca o próprio remetente', async () => {
      const deal = await journey.advanceTo('ACCEPTED');

      await useCase.execute({
        actorUserId: 'buyer',
        dealId: deal.id,
        body: 'Olá',
        clientId: null,
      });

      const evento = ctx.db.outbox.findLast((item) => item.type === 'message.created');

      expect(evento!.payload.recipientUserId).toBe('creator');
    });

    it('remove espaço à volta do corpo', async () => {
      const deal = await journey.advanceTo('ACCEPTED');

      const mensagem = await useCase.execute({
        actorUserId: 'buyer',
        dealId: deal.id,
        body: '   Olá   ',
        clientId: null,
      });

      expect(mensagem.body).toBe('Olá');
    });
  });

  describe('duplo envio em rede fraca', () => {
    it('o mesmo clientId devolve a mensagem já criada em vez de duplicar', async () => {
      const deal = await journey.advanceTo('ACCEPTED');

      const primeira = await useCase.execute({
        actorUserId: 'buyer',
        dealId: deal.id,
        body: 'Olá',
        clientId: 'cliente-1',
      });

      const segunda = await useCase.execute({
        actorUserId: 'buyer',
        dealId: deal.id,
        body: 'Olá',
        clientId: 'cliente-1',
      });

      expect(segunda.id).toBe(primeira.id);

      const texto = (await ctx.messages.listByDeal(deal.id, 50)).filter(
        (mensagem) => mensagem.body === 'Olá',
      );
      expect(texto).toHaveLength(1);
    });

    it('clientIds diferentes criam mensagens diferentes', async () => {
      const deal = await journey.advanceTo('ACCEPTED');

      const primeira = await useCase.execute({
        actorUserId: 'buyer',
        dealId: deal.id,
        body: 'Olá',
        clientId: 'cliente-1',
      });

      const segunda = await useCase.execute({
        actorUserId: 'buyer',
        dealId: deal.id,
        body: 'Olá',
        clientId: 'cliente-2',
      });

      expect(segunda.id).not.toBe(primeira.id);
    });
  });

  describe('autorização e estado', () => {
    it('um terceiro não encontra a conversa (RN-060, RN-063)', async () => {
      const deal = await journey.advanceTo('ACCEPTED');
      ctx.seedUser({ id: 'estranho' });

      await expect(
        useCase.execute({
          actorUserId: 'estranho',
          dealId: deal.id,
          body: 'Deixa ver isto',
          clientId: null,
        }),
      ).rejects.toThrowError(DealNotFoundError);
    });

    it('nada é escrito quando um terceiro tenta', async () => {
      const deal = await journey.advanceTo('ACCEPTED');
      ctx.seedUser({ id: 'estranho' });
      const antes = (await ctx.messages.listByDeal(deal.id, 50)).length;

      await expect(
        useCase.execute({
          actorUserId: 'estranho',
          dealId: deal.id,
          body: 'Deixa ver isto',
          clientId: null,
        }),
      ).rejects.toThrow();

      expect(await ctx.messages.listByDeal(deal.id, 50)).toHaveLength(antes);
    });

    it('aceita mensagens depois de o negócio fechar, dentro dos 30 dias', async () => {
      const deal = await journey.advanceTo('PAID');

      ctx.clock.advanceHours(24 * 29);

      const mensagem = await useCase.execute({
        actorUserId: 'buyer',
        dealId: deal.id,
        body: 'Ficou muito bom, obrigado!',
        clientId: null,
      });

      expect(mensagem.body).toBe('Ficou muito bom, obrigado!');
    });

    it('fecha a conversa passados 30 dias do fecho', async () => {
      const deal = await journey.advanceTo('PAID');

      ctx.clock.advanceHours(24 * 31);

      await expect(
        useCase.execute({
          actorUserId: 'buyer',
          dealId: deal.id,
          body: 'Ainda aí?',
          clientId: null,
        }),
      ).rejects.toThrowError(ConversationClosedError);
    });
  });
});
