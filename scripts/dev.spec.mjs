import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as runtime from './local-runtime.mjs';

vi.mock('./local-runtime.mjs', async importOriginal => ({
  ...await importOriginal(),
  children: new Set(),
  exists: vi.fn(),
  loadLocalEnv: vi.fn(),
  health: vi.fn(),
  portAvailable: vi.fn(),
  launch: vi.fn(),
  run: vi.fn(),
  stopChildren: vi.fn(),
  waitFor: vi.fn(async check => {
    if (!await check()) throw new Error('Serviço não ficou pronto.');
  }),
}));

describe('arranque do frontend pela raiz e por apps/web', () => {
  let previousExitCode;
  beforeEach(() => {
    previousExitCode = process.exitCode;
    vi.resetModules();
    vi.clearAllMocks();
    runtime.children.clear();
    runtime.exists.mockResolvedValue(true);
    runtime.health.mockReset().mockResolvedValue(true);
    runtime.portAvailable.mockResolvedValue(true);
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    process.exitCode = previousExitCode;
    vi.restoreAllMocks();
  });

  it('reutiliza o frontend existente sem lançar Next, Docker ou migrações', async () => {
    const { main } = await import('./dev.mjs');
    await main(['--web-only']);
    expect(runtime.launch).not.toHaveBeenCalled();
    expect(runtime.run).not.toHaveBeenCalled();
    expect(runtime.portAvailable).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('instância existente foi reutilizada'));
  });

  it('inicia o comando interno uma só vez se a porta estiver livre', async () => {
    const child = Object.assign(new EventEmitter(), { exitCode: null });
    runtime.launch.mockReturnValue(child);
    runtime.health.mockResolvedValueOnce(false);
    const { main } = await import('./dev.mjs');
    await main(['--web-only']);
    expect(runtime.launch).toHaveBeenCalledTimes(1);
    expect(runtime.launch).toHaveBeenCalledWith('npm', ['run', 'dev:server', '--workspace', '@nadm/web'], expect.any(Object));
    expect(runtime.run).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('Frontend NaDM pronto'));
  });

  it('aguarda uma instância NaDM ainda a arrancar sem duplicar servidores', async () => {
    runtime.health.mockResolvedValueOnce(false);
    runtime.portAvailable.mockResolvedValue(false);
    const { main } = await import('./dev.mjs');
    await main(['--web-only']);
    expect(runtime.waitFor).toHaveBeenCalledWith(expect.any(Function), expect.stringContaining('ocupada'), 30_000);
    expect(runtime.launch).not.toHaveBeenCalled();
    expect(runtime.stopChildren).not.toHaveBeenCalled();
  });

  it('falha sem iniciar outro servidor quando a porta pertence a outra aplicação', async () => {
    runtime.health.mockResolvedValue(false);
    runtime.portAvailable.mockResolvedValue(false);
    const { main } = await import('./dev.mjs');
    await main(['--web-only']);
    expect(process.exitCode).toBe(1);
    expect(runtime.launch).not.toHaveBeenCalled();
    expect(runtime.children.size).toBe(0);
    expect(console.info).not.toHaveBeenCalledWith(expect.stringContaining('Frontend NaDM pronto'));
  });

  it('avisa quando só o frontend está disponível', async () => {
    runtime.health.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const { main } = await import('./dev.mjs');
    await main(['--web-only']);
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('A API está indisponível'));
    expect(runtime.launch).not.toHaveBeenCalled();
  });

  it('liga o comando público ao arranque protegido e deixa Next no comando interno', async () => {
    const web = JSON.parse(await readFile(new URL('../apps/web/package.json', import.meta.url), 'utf8'));
    expect(web.scripts.dev).toBe('node ../../scripts/dev.mjs --web-only');
    expect(web.scripts['dev:server']).toBe('next dev --hostname 127.0.0.1 --port 3001');
  });

  it('arrancar pelo backend levanta o projecto inteiro, com túnel', async () => {
    const api = JSON.parse(await readFile(new URL('../apps/api/package.json', import.meta.url), 'utf8'));

    // `npm run dev` dentro de apps/api tem de dar API, frontend e ngrok — é o
    // que faz do directório do backend um sítio de onde se arranca o projecto.
    expect(api.scripts.dev).toBe('node ../../scripts/dev.mjs --ngrok');
    expect(api.scripts['dev:server']).toBe('nest start --watch');
  });

  it('nenhum `dev` de workspace pode ser lançado pelo orquestrador', async () => {
    // O invariante que impede a recursão: `dev` orquestra, `dev:server` corre.
    // Quem lançar `dev` daqui põe o orquestrador a chamar-se a si próprio.
    for (const workspace of ['api', 'web']) {
      const pkg = JSON.parse(
        await readFile(new URL(`../apps/${workspace}/package.json`, import.meta.url), 'utf8'),
      );

      expect(pkg.scripts.dev).toContain('scripts/dev.mjs');
      expect(pkg.scripts['dev:server']).not.toContain('scripts/dev.mjs');
    }
  });

  it('o arranque completo também usa o comando interno sem recursão', async () => {
    runtime.launch.mockReturnValue(Object.assign(new EventEmitter(), { exitCode: null }));
    runtime.health.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const { main } = await import('./dev.mjs');
    await main([]);
    expect(runtime.run).toHaveBeenCalledTimes(3);
    expect(runtime.launch).toHaveBeenCalledTimes(1);
    expect(runtime.launch).toHaveBeenCalledWith('npm', ['run', 'dev:server', '--workspace', '@nadm/web'], expect.any(Object));
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('NaDM pronto'));
  });
});
