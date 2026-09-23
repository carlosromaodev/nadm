import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  /** Papel restrito da aplicação: sem UPDATE nem DELETE no razão. */
  DATABASE_URL: z.string().min(1),
  /** Papel dono, só para migrações. Nunca usado pelo processo em execução. */
  DIRECT_DATABASE_URL: z.string().min(1).optional(),
  CORS_ORIGIN: z.string().default('http://localhost:3001'),
  /** Ver DP-04: só `fake` tem implementação enquanto o parceiro não fechar. */
  PAYMENTS_PROVIDER: z.enum(['fake', 'multicaixa']).default('fake'),
  /** Comissão por lado, em pontos base. 500 = 5%. Ver DP-07. */
  PLATFORM_FEE_BP: z.coerce.number().int().min(0).max(10_000).default(500),
  /** Ver DP-01: `dev` recusa arrancar com NODE_ENV=production. */
  AUTH_ADAPTER: z.enum(['dev', 'real']).default('dev'),
  /**
   * Intervalo do varrimento de prazos (T13 e T10), em milissegundos. `0`
   * desliga-o — é o que os testes ponta a ponta usam, porque lá quem manda no
   * tempo é o teste e não o relógio da máquina.
   */
  DEAL_DEADLINE_SWEEP_MS: z.coerce.number().int().min(0).default(60_000),
  /**
   * Levantamento mínimo, em cêntimos de Kwanza. 500 000 = 5 000,00 Kz. Cada
   * ordem ao parceiro tem custo fixo, e abaixo disto não compensa (RN-054).
   */
  MINIMUM_PAYOUT_MINOR: z.coerce.number().int().min(0).default(500_000),
  /**
   * Intervalo da reconciliação, em milissegundos. `0` desliga-a. O valor por
   * omissão é de hora a hora e não diário: uma divergência de dinheiro
   * descoberta ao fim de um dia já teve um dia para crescer.
   */
  RECONCILIATION_SWEEP_MS: z.coerce.number().int().min(0).default(3_600_000),
  /** Ver DP-03: só `fake` tem implementação enquanto os fornecedores não fecharem. */
  NOTIFICATIONS_PROVIDER: z.enum(['fake', 'real']).default('fake'),
  /**
   * Intervalo do despacho de notificações, em milissegundos. `0` desliga-o.
   * Curto de propósito: uma notificação atrasada meia hora já não serve.
   */
  OUTBOX_SWEEP_MS: z.coerce.number().int().min(0).default(15_000),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(source: Record<string, unknown>): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(`Invalid environment variables:\n${issues}`);
  }

  return result.data;
}
