import { describe, expect, it } from 'vitest';
import { ResourceNotFoundError } from '@/core/errors/domain-error';
import { makeTestContext } from '@/shared/testing/test-context';
import { ListMyOffersUseCase } from './list-my-offers.use-case';

describe('ListMyOffersUseCase', () => {
  it('lista as próprias ofertas activas, pausadas e rascunhos, não as arquivadas', async () => {
    const ctx = makeTestContext(); ctx.seedCreator({ id: 'creator' }); ctx.seedCreator({ id: 'other' });
    for (const status of ['ACTIVE', 'DRAFT', 'PAUSED', 'ARCHIVED'] as const) ctx.seedOffer({ id: status, profileId: 'profile-creator', status });
    ctx.seedOffer({ id: 'private', profileId: 'profile-other' });
    const useCase = new ListMyOffersUseCase(ctx.transactions, ctx.profiles, ctx.offers);
    expect((await useCase.execute('creator')).map(({ id }) => id)).toEqual(['ACTIVE', 'DRAFT', 'PAUSED']);
    await expect(useCase.execute('outsider')).rejects.toThrow(ResourceNotFoundError);
  });
});
