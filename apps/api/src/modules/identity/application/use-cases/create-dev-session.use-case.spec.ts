import { beforeEach, describe, expect, it } from 'vitest';
import { BusinessRuleError, ForbiddenActionError, ResourceConflictError } from '@/core/errors/domain-error';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';
import { DevSessionRepository, type CreateDevIdentity } from '../ports/dev-session.repository';
import { CreateDevSessionUseCase } from './create-dev-session.use-case';

class MemoryDevSessions extends DevSessionRepository {
  constructor(private readonly ctx: TestContext) { super(); }
  async create(input: CreateDevIdentity) {
    this.ctx.db.users.set(input.userId, { id: input.userId, phone: input.phone, email: null, displayName: input.displayName,
      roles: input.role === 'CREATOR' ? ['FAN', 'CREATOR'] : ['FAN'], status: 'ACTIVE', verificationLevel: 'NONE' });
    this.ctx.db.accounts.set(input.accountId, { id: input.accountId, ownerUserId: input.userId, type: 'INDIVIDUAL', legalName: null, taxId: null });
  }
}

describe('CreateDevSessionUseCase', () => {
  let ctx: TestContext; let useCase: CreateDevSessionUseCase; let enabled: boolean;
  beforeEach(() => {
    ctx = makeTestContext(); enabled = true;
    useCase = new CreateDevSessionUseCase(ctx.transactions, new MemoryDevSessions(ctx), ctx.users,
      { isEnabled: () => enabled }, ctx.ids, ctx.auditLog);
  });
  it('cria conta de comprador com conta individual sem fingir verificar telefone', async () => {
    const result = await useCase.execute({ displayName: '  Ana  ', phone: '923 456 789', role: 'BUYER' });
    expect(result.displayName).toBe('Ana'); expect(result.developmentOnly).toBe(true);
    const user = await ctx.users.findById(result.userId);
    expect(user?.phone).toBe('+244923456789'); expect(user?.roles).toEqual(['FAN']); expect(user?.verificationLevel).toBe('NONE');
    expect((await ctx.accounts.findIndividualByUser(result.userId))?.type).toBe('INDIVIDUAL');
    expect(JSON.stringify(ctx.db.auditLog)).not.toContain('923456789');
  });
  it('cria criador distinto sem telefone pessoal obrigatório', async () => {
    const first = await useCase.execute({ displayName: 'Carlos', role: 'CREATOR' });
    const second = await useCase.execute({ displayName: 'Nelson', role: 'CREATOR' });
    expect(first.userId).not.toBe(second.userId);
    expect((await ctx.users.findById(first.userId))?.roles).toEqual(['FAN', 'CREATOR']);
  });
  it('recusa telefone já registado e nunca autentica a pessoa que o enviou', async () => {
    ctx.seedUser({ id: 'existing', phone: '+244923456789', displayName: 'Dono' });
    await expect(useCase.execute({ displayName: 'Intruso', phone: '+244923456789', role: 'CREATOR' })).rejects.toThrow(ResourceConflictError);
    expect(ctx.db.users.size).toBe(1); expect((await ctx.users.findById('existing'))?.displayName).toBe('Dono');
  });
  it('não funciona fora do adaptador de desenvolvimento', async () => {
    enabled = false;
    await expect(useCase.execute({ displayName: 'Ana', role: 'BUYER' })).rejects.toThrow(ForbiddenActionError);
    expect(ctx.db.users.size).toBe(0);
  });
  it('recusa nome curto ou telefone inválido', async () => {
    await expect(useCase.execute({ displayName: '', role: 'BUYER' })).rejects.toThrow(BusinessRuleError);
    await expect(useCase.execute({ displayName: 'Ana', role: 'BUYER', phone: '+351123456789' })).rejects.toThrow(BusinessRuleError);
  });
});
