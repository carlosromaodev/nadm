import { beforeEach, describe, expect, it } from 'vitest';
import { BusinessRuleError, ForbiddenActionError, ResourceNotFoundError } from '@/core/errors/domain-error';
import { maskPhone } from '@/modules/identity/domain/user';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';
import { ReinstateUserUseCase, SuspendUserUseCase } from './admin-ops.use-case';

describe('suspensão de conta (F10)', () => {
  let ctx: TestContext;
  let suspender: SuspendUserUseCase;
  let reactivar: ReinstateUserUseCase;

  beforeEach(() => {
    ctx = makeTestContext();

    suspender = new SuspendUserUseCase(
      ctx.transactions,
      ctx.users,
      ctx.outbox,
      ctx.auditLog,
      ctx.clock,
    );
    reactivar = new ReinstateUserUseCase(ctx.transactions, ctx.users, ctx.auditLog);

    ctx.seedUser({ id: 'admin' });
    ctx.seedUser({ id: 'burlao' });
  });

  it('suspende com motivo, e o efeito é imediato no estado', async () => {
    await suspender.execute({
      reviewerUserId: 'admin',
      userId: 'burlao',
      reason: 'Pediu pagamento por fora da plataforma.',
    });

    const user = ctx.db.users.get('burlao')!;
    expect(user.status).toBe('SUSPENDED');
    expect(user.suspensionReason).toBe('Pediu pagamento por fora da plataforma.');
    expect(user.suspendedAt).toEqual(ctx.clock.now());
  });

  it('suspender sem motivo é recusado', async () => {
    await expect(
      suspender.execute({ reviewerUserId: 'admin', userId: 'burlao', reason: '  ' }),
    ).rejects.toThrow(BusinessRuleError);

    expect(ctx.db.users.get('burlao')?.status).toBe('ACTIVE');
  });

  it('ninguém se suspende a si próprio', async () => {
    await expect(
      suspender.execute({ reviewerUserId: 'admin', userId: 'admin', reason: 'engano' }),
    ).rejects.toThrow(ForbiddenActionError);
  });

  it('suspender uma conta que não existe é 404', async () => {
    await expect(
      suspender.execute({ reviewerUserId: 'admin', userId: 'ninguem', reason: 'x' }),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  it('o motivo fica na auditoria — é o que justifica o acto daqui a meio ano', async () => {
    await suspender.execute({
      reviewerUserId: 'admin',
      userId: 'burlao',
      reason: 'Pediu pagamento por fora da plataforma.',
    });

    expect(ctx.db.auditLog).toContainEqual(
      expect.objectContaining({
        action: 'user.suspended',
        actorUserId: 'admin',
        subjectId: 'burlao',
        metadata: { reason: 'Pediu pagamento por fora da plataforma.' },
      }),
    );
  });

  it('reactivar limpa o motivo e volta a deixar entrar', async () => {
    await suspender.execute({ reviewerUserId: 'admin', userId: 'burlao', reason: 'engano' });

    await reactivar.execute({
      reviewerUserId: 'admin',
      userId: 'burlao',
      note: 'Foi engano nosso.',
    });

    const user = ctx.db.users.get('burlao')!;
    expect(user.status).toBe('ACTIVE');
    expect(user.suspensionReason).toBeNull();
    expect(user.suspendedAt).toBeNull();
  });

  it('reactivar sem justificação é recusado', async () => {
    await expect(
      reactivar.execute({ reviewerUserId: 'admin', userId: 'burlao', note: '' }),
    ).rejects.toThrow(BusinessRuleError);
  });
});

describe('maskPhone', () => {
  it('deixa reconhecer o próprio número sem permitir marcá-lo', () => {
    expect(maskPhone('+244923111222')).toBe('+2449****222');
  });

  it('um valor curto de mais desaparece por inteiro', () => {
    expect(maskPhone('12345')).toBe('*****');
  });
});
