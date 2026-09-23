import { describe, expect, it } from 'vitest';
import { validateEnv } from './env';

describe('validateEnv', () => {
  it('applies defaults when only the required vars are present', () => {
    const env = validateEnv({ DATABASE_URL: 'file:./dev.db' });

    expect(env).toEqual({
      NODE_ENV: 'development',
      PORT: 3333,
      DATABASE_URL: 'file:./dev.db',
      CORS_ORIGIN: 'http://localhost:3001',
      PAYMENTS_PROVIDER: 'fake',
      PLATFORM_FEE_BP: 500,
      AUTH_ADAPTER: 'dev',
      DEAL_DEADLINE_SWEEP_MS: 60_000,
      MINIMUM_PAYOUT_MINOR: 500_000,
      RECONCILIATION_SWEEP_MS: 3_600_000,
      NOTIFICATIONS_PROVIDER: 'fake',
      OUTBOX_SWEEP_MS: 15_000,
    });
  });

  it('recusa uma comissão fora do intervalo de pontos base', () => {
    expect(() =>
      validateEnv({ DATABASE_URL: 'file:./dev.db', PLATFORM_FEE_BP: '10001' }),
    ).toThrowError(/PLATFORM_FEE_BP/);
  });

  it('recusa um parceiro de pagamentos sem implementação', () => {
    expect(() =>
      validateEnv({ DATABASE_URL: 'file:./dev.db', PAYMENTS_PROVIDER: 'stripe' }),
    ).toThrowError(/PAYMENTS_PROVIDER/);
  });

  it('coerces PORT from the string the process actually provides', () => {
    const env = validateEnv({ DATABASE_URL: 'file:./dev.db', PORT: '8080' });

    expect(env.PORT).toBe(8080);
  });

  it('rejects a missing DATABASE_URL instead of booting a broken app', () => {
    expect(() => validateEnv({})).toThrowError(/DATABASE_URL/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() =>
      validateEnv({ DATABASE_URL: 'file:./dev.db', NODE_ENV: 'staging' }),
    ).toThrowError(/NODE_ENV/);
  });
});
