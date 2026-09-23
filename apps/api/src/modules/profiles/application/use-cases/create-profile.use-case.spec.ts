import { beforeEach, describe, expect, it } from 'vitest';
import { ResourceConflictError, ResourceNotFoundError } from '@/core/errors/domain-error';
import { InvalidHandleError } from '@/shared/domain/handle';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';
import { CreateOfferUseCase } from './create-offer.use-case';
import { CreateProfileUseCase } from './create-profile.use-case';
import { GetProfileByHandleUseCase } from './get-profile-by-handle.use-case';

describe('CreateProfileUseCase', () => {
  let ctx: TestContext;
  let useCase: CreateProfileUseCase;

  beforeEach(() => {
    ctx = makeTestContext();
    useCase = new CreateProfileUseCase(
      ctx.transactions,
      ctx.profiles,
      ctx.auditLog,
      ctx.ids,
      ctx.clock,
    );

    ctx.seedUser({ id: 'nelson' });
  });

  it('cria o perfil com o handle normalizado', async () => {
    const perfil = await useCase.execute({
      actorUserId: 'nelson',
      handle: '  NelsonBeats  ',
      displayName: 'Nelson Beats',
    });

    expect(perfil.handle).toBe('nelsonbeats');
    expect(perfil.userId).toBe('nelson');
  });

  it('escreve auditoria', async () => {
    await useCase.execute({
      actorUserId: 'nelson',
      handle: 'nelsonbeats',
      displayName: 'Nelson Beats',
    });

    expect(ctx.db.auditLog).toContainEqual(
      expect.objectContaining({ action: 'profile.created', actorUserId: 'nelson' }),
    );
  });

  it('recusa um handle já ocupado', async () => {
    ctx.seedUser({ id: 'outro' });

    await useCase.execute({
      actorUserId: 'nelson',
      handle: 'nelsonbeats',
      displayName: 'Nelson Beats',
    });

    await expect(
      useCase.execute({
        actorUserId: 'outro',
        handle: 'NelsonBeats',
        displayName: 'Impostor',
      }),
    ).rejects.toThrowError(ResourceConflictError);
  });

  it('recusa um segundo perfil para o mesmo utilizador', async () => {
    await useCase.execute({
      actorUserId: 'nelson',
      handle: 'nelsonbeats',
      displayName: 'Nelson Beats',
    });

    await expect(
      useCase.execute({
        actorUserId: 'nelson',
        handle: 'outro_handle',
        displayName: 'Nelson Beats',
      }),
    ).rejects.toThrowError(ResourceConflictError);
  });

  it('recusa um handle que colide com uma rota da aplicação (RN-012)', async () => {
    await expect(
      useCase.execute({ actorUserId: 'nelson', handle: 'admin', displayName: 'Nelson' }),
    ).rejects.toThrowError(InvalidHandleError);
  });

  it('recusa um handle com forma inválida', async () => {
    await expect(
      useCase.execute({ actorUserId: 'nelson', handle: 'a b', displayName: 'Nelson' }),
    ).rejects.toThrowError(InvalidHandleError);
  });
});

describe('CreateOfferUseCase', () => {
  let ctx: TestContext;
  let useCase: CreateOfferUseCase;

  beforeEach(() => {
    ctx = makeTestContext();
    useCase = new CreateOfferUseCase(
      ctx.transactions,
      ctx.offers,
      ctx.profiles,
      ctx.auditLog,
      ctx.ids,
    );

    ctx.seedCreator({ id: 'nelson', handle: 'nelsonbeats' });
  });

  it('cria a oferta com o preço em cêntimos, sem passar por vírgula flutuante', async () => {
    const oferta = await useCase.execute({
      actorUserId: 'nelson',
      title: 'Vídeo personalizado',
      priceMinor: '5000000',
      slaHours: 48,
    });

    expect(oferta.priceMinor).toBe(5_000_000n);
    expect(oferta.currency).toBe('AOA');
    expect(oferta.status).toBe('ACTIVE');
  });

  it('recusa um preço com casas decimais em vez de o arredondar (RN-111)', async () => {
    await expect(
      useCase.execute({
        actorUserId: 'nelson',
        title: 'Vídeo',
        priceMinor: '50000.50',
        slaHours: 48,
      }),
    ).rejects.toThrowError(/integer amount/);
  });

  it('recusa um preço negativo (RN-030)', async () => {
    await expect(
      useCase.execute({
        actorUserId: 'nelson',
        title: 'Vídeo',
        priceMinor: '-100',
        slaHours: 48,
      }),
    ).rejects.toThrowError(/cannot be negative/);
  });

  it('recusa um prazo de entrega não positivo', async () => {
    await expect(
      useCase.execute({
        actorUserId: 'nelson',
        title: 'Vídeo',
        priceMinor: '5000000',
        slaHours: 0,
      }),
    ).rejects.toThrowError(/positive delivery window/);
  });

  it('recusa criar oferta para quem ainda não tem perfil', async () => {
    ctx.seedUser({ id: 'sem-perfil' });

    await expect(
      useCase.execute({
        actorUserId: 'sem-perfil',
        title: 'Vídeo',
        priceMinor: '5000000',
        slaHours: 48,
      }),
    ).rejects.toThrowError(ResourceNotFoundError);
  });
});

describe('GetProfileByHandleUseCase', () => {
  let ctx: TestContext;
  let useCase: GetProfileByHandleUseCase;

  beforeEach(() => {
    ctx = makeTestContext();
    useCase = new GetProfileByHandleUseCase(ctx.transactions, ctx.profiles, ctx.offers, ctx.availability, ctx.clock);

    ctx.seedCreator({ id: 'nelson', handle: 'nelsonbeats' });
    ctx.seedOffer({ id: 'offer-1', profileId: 'profile-nelson' });
  });

  it('devolve o perfil com as ofertas activas', async () => {
    const vista = await useCase.execute('nelsonbeats');

    expect(vista.profile.handle).toBe('nelsonbeats');
    expect(vista.offers).toHaveLength(1);
  });

  it('encontra o perfil independentemente da caixa do handle', async () => {
    const vista = await useCase.execute('NelsonBeats');

    expect(vista.profile.handle).toBe('nelsonbeats');
  });

  it('não mostra ofertas arquivadas', async () => {
    ctx.seedOffer({ id: 'offer-2', profileId: 'profile-nelson', status: 'ARCHIVED' });

    const vista = await useCase.execute('nelsonbeats');

    expect(vista.offers.map((oferta) => oferta.id)).toEqual(['offer-1']);
  });

  it('um perfil por publicar é indistinguível de um inexistente', async () => {
    ctx.seedCreator({ id: 'rascunho', handle: 'rascunho_perfil', published: false });

    const porPublicar = await useCase.execute('rascunho_perfil').catch((error: Error) => error);
    const inexistente = await useCase.execute('nao_existe_mesmo').catch((error: Error) => error);

    expect((porPublicar as Error).name).toBe((inexistente as Error).name);
    expect(porPublicar).toBeInstanceOf(ResourceNotFoundError);
  });
});
