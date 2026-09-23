import { beforeEach, describe, expect, it } from 'vitest';
import { BusinessRuleError, ResourceNotFoundError } from '@/core/errors/domain-error';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';
import { UpdateProfileUseCase } from './update-profile.use-case';
import { acceptsNewDeals } from '../../domain/profile';

describe('UpdateProfileUseCase', () => {
  let ctx: TestContext;
  let useCase: UpdateProfileUseCase;
  beforeEach(() => {
    ctx = makeTestContext(); ctx.seedCreator({ id: 'creator' });
    useCase = new UpdateProfileUseCase(ctx.transactions, ctx.profiles, ctx.auditLog);
  });
  it('persiste nome, bio, disponibilidade e preferências privadas e audita só nomes dos campos', async () => {
    const updated = await useCase.execute('creator', { displayName: '  Carlos  ', bio: ' Música ', availabilityStatus: 'PAUSED',
      settings: { expressPhone: '+244923456789', theme: 'light' } });
    expect(updated.displayName).toBe('Carlos'); expect(updated.bio).toBe('Música');
    expect(await ctx.profiles.findByUserId('creator')).toEqual(updated);
    expect(acceptsNewDeals(updated)).toBe(false);
    expect(JSON.stringify(ctx.db.auditLog)).not.toContain('+244923456789');
  });
  it('mistura preferências sem apagar as anteriores', async () => {
    await useCase.execute('creator', { settings: { theme: 'light', category: 'Música' } });
    const updated = await useCase.execute('creator', { settings: { notifications: false } });
    expect(updated.settings).toEqual({ theme: 'light', category: 'Música', notifications: false });
  });
  it('esconder o perfil impede novos negócios', async () => {
    expect(acceptsNewDeals(await useCase.execute('creator', { settings: { publicVisible: false } }))).toBe(false);
  });
  it('não edita perfis de outra pessoa', async () => {
    await expect(useCase.execute('outsider', { bio: 'Intrusão' })).rejects.toThrow(ResourceNotFoundError);
    expect((await ctx.profiles.findByUserId('creator'))?.bio).toBeNull();
  });
  it('recusa nome vazio e agenda invertida', async () => {
    await expect(useCase.execute('creator', { displayName: ' ' })).rejects.toThrow(BusinessRuleError);
    await expect(useCase.execute('creator', { settings: { agenda: { days: [1], startTime: '18:00', endTime: '09:00', slotsPerDay: 2 } } })).rejects.toThrow(BusinessRuleError);
  });
});
