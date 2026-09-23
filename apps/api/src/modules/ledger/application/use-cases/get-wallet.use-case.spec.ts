import { beforeEach, describe, expect, it } from 'vitest';
import { ResourceNotFoundError } from '@/core/errors/domain-error';
import { makeJourney } from '@/shared/testing/deal-journey';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';
import { GetWalletUseCase } from './get-wallet.use-case';

describe('GetWalletUseCase', () => {
  let ctx: TestContext;
  let journey: ReturnType<typeof makeJourney>;
  let useCase: GetWalletUseCase;

  beforeEach(() => {
    ctx = makeTestContext();
    journey = makeJourney(ctx);

    useCase = new GetWalletUseCase(
      ctx.transactions,
      ctx.profiles,
      ctx.wallets,
      ctx.ledger,
      ctx.clock,
    );

    ctx.seedUser({ id: 'buyer' });
    ctx.seedCreator({ id: 'creator', handle: 'nelsonbeats' });
    ctx.seedOffer({ id: 'offer-1', profileId: 'profile-creator' });
  });

  it('um criador sem negócios tem saldo zero', async () => {
    const { wallet } = await useCase.execute({ actorUserId: 'creator' });

    expect(wallet.available.amountMinor).toBe(0n);
    expect(wallet.available.currency).toBe('AOA');
  });

  it('o dinheiro retido ainda não conta como saldo do criador', async () => {
    await journey.advanceTo('DELIVERED');

    const { wallet } = await useCase.execute({ actorUserId: 'creator' });

    expect(wallet.available.amountMinor).toBe(0n);
  });

  it('depois da aprovação, o saldo é exactamente o líquido do negócio', async () => {
    await journey.advanceTo('PAID');

    const { wallet } = await useCase.execute({ actorUserId: 'creator' });

    expect(wallet.available.amountMinor).toBe(4_750_000n);
  });

  it('dois negócios somam-se', async () => {
    await journey.advanceTo('PAID');
    await journey.advanceTo('PAID');

    const { wallet } = await useCase.execute({ actorUserId: 'creator' });

    expect(wallet.available.amountMinor).toBe(9_500_000n);
  });

  it('o saldo é recalculado a partir do razão, não lido de um campo (RN-103)', async () => {
    await journey.advanceTo('PAID');

    // Corrompe a projecção de propósito: o saldo devolvido tem de a ignorar.
    ctx.db.ledger.length = 0;

    const { wallet } = await useCase.execute({ actorUserId: 'creator' });

    expect(wallet.available.amountMinor).toBe(0n);
  });

  it('devolve os movimentos que compõem o saldo, sem os da plataforma', async () => {
    await journey.advanceTo('PAID');

    const { entries } = await useCase.execute({ actorUserId: 'creator' });

    // A comissão da plataforma tem outro sujeito: não entra no extracto de
    // quem a pagou.
    // Duas linhas, como no design: o que entrou e a taxa que saiu.
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => [e.direction, e.amount.amountMinor])).toEqual([
      ['CREDIT', 5_000_000n],
      ['DEBIT', 250_000n],
    ]);
    expect(entries.every((e) => e.account === 'CREATOR_AVAILABLE')).toBe(true);
  });

  it('quem não tem perfil não tem carteira', async () => {
    await expect(useCase.execute({ actorUserId: 'buyer' })).rejects.toThrowError(
      ResourceNotFoundError,
    );
  });
});
