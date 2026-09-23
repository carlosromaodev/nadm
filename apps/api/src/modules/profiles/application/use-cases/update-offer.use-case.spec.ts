import { beforeEach, describe, expect, it } from 'vitest';
import { BusinessRuleError, ResourceNotFoundError } from '@/core/errors/domain-error';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';
import { UpdateOfferUseCase } from './update-offer.use-case';
import { snapshotOf } from '../../domain/profile';

describe('UpdateOfferUseCase', () => {
  let ctx: TestContext; let useCase: UpdateOfferUseCase;
  beforeEach(() => {
    ctx = makeTestContext(); ctx.seedCreator({ id: 'creator' }); ctx.seedCreator({ id: 'other' });
    ctx.seedOffer({ id: 'offer', profileId: 'profile-creator' });
    useCase = new UpdateOfferUseCase(ctx.transactions, ctx.profiles, ctx.offers, ctx.auditLog);
  });
  it('edita preço sem perder precisão e não altera o snapshot já contratado', async () => {
    const snapshot = snapshotOf((await ctx.offers.findById('offer'))!, ctx.clock.now());
    const updated = await useCase.execute('creator', 'offer', { title: ' Serviço ', priceMinor: '9007199254740993', slaHours: 72 });
    expect(updated.priceMinor).toBe(9007199254740993n); expect(updated.title).toBe('Serviço');
    expect(snapshot.priceMinor).toBe('5000000');
    expect(ctx.db.auditLog).toContainEqual(expect.objectContaining({ action: 'offer.updated', subjectId: 'offer' }));
  });
  it('pausa, reactiva e arquiva sem apagar a oferta', async () => {
    expect((await useCase.execute('creator', 'offer', { status: 'PAUSED' })).status).toBe('PAUSED');
    expect((await useCase.execute('creator', 'offer', { status: 'ACTIVE' })).status).toBe('ACTIVE');
    expect((await useCase.execute('creator', 'offer', { status: 'ARCHIVED' })).status).toBe('ARCHIVED');
    await expect(useCase.execute('creator', 'offer', { status: 'ACTIVE' })).rejects.toThrow(ResourceNotFoundError);
  });
  it('recusa alterar oferta de outra pessoa sem revelar existência', async () => {
    await expect(useCase.execute('other', 'offer', { title: 'Roubo' })).rejects.toThrow(ResourceNotFoundError);
    await expect(useCase.execute('creator', 'missing', { title: 'Roubo' })).rejects.toThrow(ResourceNotFoundError);
  });
  it('recusa valores negativos, decimais, prazo inválido e título vazio', async () => {
    await expect(useCase.execute('creator', 'offer', { priceMinor: '-1' })).rejects.toThrow(BusinessRuleError);
    await expect(useCase.execute('creator', 'offer', { priceMinor: '1.2' })).rejects.toThrow();
    await expect(useCase.execute('creator', 'offer', { slaHours: 0 })).rejects.toThrow(BusinessRuleError);
    await expect(useCase.execute('creator', 'offer', { title: '' })).rejects.toThrow(BusinessRuleError);
  });
});
