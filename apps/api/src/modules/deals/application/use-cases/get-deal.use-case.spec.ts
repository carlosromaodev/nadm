import { beforeEach, describe, expect, it } from 'vitest';
import { makeJourney } from '@/shared/testing/deal-journey';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';
import { DealNotFoundError } from '../../domain/errors';
import { GetDealUseCase, ListDealsUseCase } from './get-deal.use-case';
import { ListMessagesUseCase } from './list-messages.use-case';

describe('GetDealUseCase', () => {
  let ctx: TestContext;
  let journey: ReturnType<typeof makeJourney>;
  let useCase: GetDealUseCase;

  beforeEach(() => {
    ctx = makeTestContext();
    journey = makeJourney(ctx);

    useCase = new GetDealUseCase(ctx.transactions, ctx.deals, ctx.messages, ctx.deliveries, ctx.counterOffers, ctx.disputes);

    ctx.seedUser({ id: 'buyer' });
    ctx.seedCreator({ id: 'creator', handle: 'nelsonbeats' });
    ctx.seedOffer({ id: 'offer-1', profileId: 'profile-creator' });
  });

  it('devolve o pedido com a conversa e as entregas — tudo numa entidade', async () => {
    const deal = await journey.advanceTo('DELIVERED');

    const detalhe = await useCase.execute({ actorUserId: 'buyer', dealId: deal.id });

    expect(detalhe.deal.status).toBe('DELIVERED');
    expect(detalhe.messages.length).toBeGreaterThan(0);
    expect(detalhe.deliveries).toHaveLength(1);
  });

  it('diz ao comprador que ele é o comprador', async () => {
    const deal = await journey.advanceTo('PROPOSED');

    const detalhe = await useCase.execute({ actorUserId: 'buyer', dealId: deal.id });

    expect(detalhe.viewerRole).toBe('buyer');
  });

  it('diz ao criador que ele é o criador', async () => {
    const deal = await journey.advanceTo('PROPOSED');

    const detalhe = await useCase.execute({ actorUserId: 'creator', dealId: deal.id });

    expect(detalhe.viewerRole).toBe('creator');
  });

  it('um terceiro não encontra o pedido (RN-063)', async () => {
    const deal = await journey.advanceTo('PROPOSED');
    ctx.seedUser({ id: 'estranho' });

    await expect(
      useCase.execute({ actorUserId: 'estranho', dealId: deal.id }),
    ).rejects.toThrowError(DealNotFoundError);
  });

  it('um pedido inexistente dá o mesmo erro que um pedido alheio', async () => {
    const deal = await journey.advanceTo('PROPOSED');
    ctx.seedUser({ id: 'estranho' });

    const alheio = await useCase
      .execute({ actorUserId: 'estranho', dealId: deal.id })
      .catch((error: Error) => error);
    const inexistente = await useCase
      .execute({ actorUserId: 'estranho', dealId: 'nao-existe' })
      .catch((error: Error) => error);

    expect((alheio as Error).name).toBe((inexistente as Error).name);
  });
});

describe('ListDealsUseCase', () => {
  let ctx: TestContext;
  let journey: ReturnType<typeof makeJourney>;
  let useCase: ListDealsUseCase;

  beforeEach(() => {
    ctx = makeTestContext();
    journey = makeJourney(ctx);

    useCase = new ListDealsUseCase(ctx.transactions, ctx.deals);

    ctx.seedUser({ id: 'buyer' });
    ctx.seedUser({ id: 'outro-comprador' });
    ctx.seedCreator({ id: 'creator', handle: 'nelsonbeats' });
    ctx.seedOffer({ id: 'offer-1', profileId: 'profile-creator' });
  });

  it('lista ao comprador apenas os pedidos dele', async () => {
    await journey.advanceTo('PROPOSED', { buyerUserId: 'buyer' });
    await journey.advanceTo('PROPOSED', { buyerUserId: 'outro-comprador' });

    const lista = await useCase.execute({ actorUserId: 'buyer', role: 'buyer' });

    expect(lista).toHaveLength(1);
    expect(lista[0].isBuyer('buyer')).toBe(true);
  });

  it('lista ao criador todos os pedidos que recebeu', async () => {
    await journey.advanceTo('PROPOSED', { buyerUserId: 'buyer' });
    await journey.advanceTo('PROPOSED', { buyerUserId: 'outro-comprador' });

    const lista = await useCase.execute({ actorUserId: 'creator', role: 'creator' });

    expect(lista).toHaveLength(2);
  });

  it('não devolve nada a quem não tem pedidos', async () => {
    await journey.advanceTo('PROPOSED', { buyerUserId: 'buyer' });
    ctx.seedUser({ id: 'estranho' });

    const lista = await useCase.execute({ actorUserId: 'estranho', role: 'buyer' });

    expect(lista).toHaveLength(0);
  });

  it('filtra por estado', async () => {
    await journey.advanceTo('PROPOSED', { buyerUserId: 'buyer' });
    await journey.advanceTo('PAID', { buyerUserId: 'buyer' });

    const pagos = await useCase.execute({
      actorUserId: 'buyer',
      role: 'buyer',
      status: 'PAID',
    });

    expect(pagos).toHaveLength(1);
    expect(pagos[0].status).toBe('PAID');
  });
});

describe('ListMessagesUseCase', () => {
  let ctx: TestContext;
  let journey: ReturnType<typeof makeJourney>;
  let useCase: ListMessagesUseCase;

  beforeEach(() => {
    ctx = makeTestContext();
    journey = makeJourney(ctx);

    useCase = new ListMessagesUseCase(ctx.transactions, ctx.deals, ctx.messages);

    ctx.seedUser({ id: 'buyer' });
    ctx.seedCreator({ id: 'creator', handle: 'nelsonbeats' });
    ctx.seedOffer({ id: 'offer-1', profileId: 'profile-creator' });
  });

  it('devolve a conversa por ordem cronológica', async () => {
    const deal = await journey.advanceTo('PAID');

    const conversa = await useCase.execute({ actorUserId: 'buyer', dealId: deal.id });

    const momentos = conversa.map((mensagem) => mensagem.createdAt.getTime());
    expect(momentos).toEqual([...momentos].sort((a, b) => a - b));
  });

  it('conta a história completa do negócio de cima a baixo', async () => {
    const deal = await journey.advanceTo('PAID');

    const corpos = (await useCase.execute({ actorUserId: 'buyer', dealId: deal.id }))
      .filter((mensagem) => mensagem.kind === 'STATE_CHANGE')
      .map((mensagem) => mensagem.body);

    expect(corpos).toEqual([
      'Pedido criado. Falta o pagamento para o criador o poder decidir.',
      'Pagamento confirmado. O valor fica retido na NaDM até aprovares a entrega.',
      'O criador aceitou o pedido. O prazo de entrega começou a contar.',
      'O criador submeteu a entrega.',
      'A entrega foi aprovada.',
      'O valor foi libertado para a carteira do criador.',
    ]);
  });

  it('um terceiro não lê a conversa (RN-060)', async () => {
    const deal = await journey.advanceTo('PROPOSED');
    ctx.seedUser({ id: 'estranho' });

    await expect(
      useCase.execute({ actorUserId: 'estranho', dealId: deal.id }),
    ).rejects.toThrowError(DealNotFoundError);
  });
});
