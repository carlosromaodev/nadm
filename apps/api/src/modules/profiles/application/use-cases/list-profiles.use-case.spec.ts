import { describe, expect, it } from 'vitest';
import { makeTestContext } from '@/shared/testing/test-context';
import { ListProfilesUseCase } from './list-profiles.use-case';
import { GetProfileByHandleUseCase } from './get-profile-by-handle.use-case';
import { ResourceNotFoundError } from '@/core/errors/domain-error';

describe('ListProfilesUseCase', () => {
  it('pesquisa apenas perfis públicos descobríveis e ofertas activas', async () => {
    const ctx = makeTestContext();
    ctx.seedCreator({ id: 'one', displayName: 'Nelson Música' }); ctx.seedOffer({ id: 'a', profileId: 'profile-one' });
    ctx.seedOffer({ id: 'b', profileId: 'profile-one', status: 'PAUSED' });
    ctx.seedCreator({ id: 'draft', displayName: 'Nelson Draft', published: false });
    ctx.seedCreator({ id: 'hidden', displayName: 'Nelson Hidden' });
    ctx.seedCreator({ id: 'direct', displayName: 'Nelson Link' });
    await ctx.profiles.update('profile-hidden', { settings: { publicVisible: false } });
    await ctx.profiles.update('profile-direct', { settings: { discoverable: false } });
    const useCase = new ListProfilesUseCase(ctx.transactions, ctx.profiles, ctx.offers);
    const found = await useCase.execute('  NELSON  ');
    expect(found.map(({ profile }) => profile.id)).toEqual(['profile-one']);
    expect(found[0].offers.map(({ id }) => id)).toEqual(['a']);
    expect(await useCase.execute('nada')).toEqual([]);
    const byHandle = new GetProfileByHandleUseCase(ctx.transactions, ctx.profiles, ctx.offers, ctx.availability, ctx.clock);
    await expect(byHandle.execute('hidden')).rejects.toThrow(ResourceNotFoundError);
    expect((await byHandle.execute('direct')).profile.id).toBe('profile-direct');
  });
});
