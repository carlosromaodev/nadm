import { beforeEach, describe, expect, it } from 'vitest';
import { ResourceNotFoundError } from '@/core/errors/domain-error';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';
import { GetMyProfileUseCase } from './get-my-profile.use-case';

describe('GetMyProfileUseCase', () => {
  let ctx: TestContext;
  let useCase: GetMyProfileUseCase;

  beforeEach(() => {
    ctx = makeTestContext();
    useCase = new GetMyProfileUseCase(ctx.transactions, ctx.profiles, ctx.offers);
  });

  it('devolve o perfil de quem está a pedir, com as ofertas activas', async () => {
    ctx.seedCreator({ id: 'nelson', handle: 'nelsonbeats' });
    ctx.seedOffer({ id: 'offer-1', profileId: 'profile-nelson' });

    const vista = await useCase.execute('nelson');

    expect(vista.profile.handle).toBe('nelsonbeats');
    expect(vista.offers).toHaveLength(1);
  });

  it('devolve o perfil mesmo por publicar — o dono vê o seu rascunho', async () => {
    ctx.seedCreator({ id: 'rascunho', handle: 'por_publicar', published: false });

    const vista = await useCase.execute('rascunho');

    expect(vista.profile.publishedAt).toBeNull();
  });

  it('quem não tem perfil recebe 404 — é assim que o cliente sabe que só compra', async () => {
    ctx.seedUser({ id: 'comprador' });

    await expect(useCase.execute('comprador')).rejects.toThrowError(ResourceNotFoundError);
  });

  it('não devolve o perfil de outra pessoa', async () => {
    ctx.seedCreator({ id: 'nelson', handle: 'nelsonbeats' });
    ctx.seedUser({ id: 'estranho' });

    await expect(useCase.execute('estranho')).rejects.toThrowError(ResourceNotFoundError);
  });

  it('não mostra ofertas arquivadas no próprio perfil', async () => {
    ctx.seedCreator({ id: 'nelson', handle: 'nelsonbeats' });
    ctx.seedOffer({ id: 'activa', profileId: 'profile-nelson' });
    ctx.seedOffer({ id: 'arquivada', profileId: 'profile-nelson', status: 'ARCHIVED' });

    const vista = await useCase.execute('nelson');

    expect(vista.offers.map((oferta) => oferta.id)).toEqual(['activa']);
  });
});
