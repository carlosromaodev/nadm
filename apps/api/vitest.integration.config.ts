import { resolve } from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Testes contra Postgres real. Correm à parte porque são mais lentos e porque
 * verificam propriedades que só a base de dados garante: restrições,
 * atomicidade e corridas de concorrência. Duplos não sabem essas coisas.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    globals: true,
    environment: 'node',
    /**
     * Os agendadores ficam desligados.
     *
     * Aqui quem manda no tempo é o teste: um varrimento de prazos ou uma
     * reconciliação a correr sozinha a meio de uma verificação mudaria dados
     * por baixo dela, e a bateria passava a falhar de vez em quando.
     */
    env: {
      DEAL_DEADLINE_SWEEP_MS: '0',
      RECONCILIATION_SWEEP_MS: '0',
      OUTBOX_SWEEP_MS: '0',
    },
    include: ['test/**/*.e2e-spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
