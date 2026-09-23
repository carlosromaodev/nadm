import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, WEB_URL, API_URL, exists, health, launch, loadLocalEnv, portAvailable, run, stopChildren, waitFor, children } from './local-runtime.mjs';

let stopping = false;
let ownedTunnel = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  stopChildren();
  process.exitCode = code;
}

async function ensureEnv(relative, example) {
  const target = resolve(ROOT, relative);
  if (!await exists(target)) {
    await writeFile(target, await readFile(resolve(ROOT, example)), { flag: 'wx', mode: 0o600 });
    console.info('Criado ' + relative + ' a partir do exemplo local.');
  }
}
/**
 * Um build de produção em `.next` envenena o servidor de desenvolvimento.
 *
 * Os dois escrevem no mesmo directório com formatos diferentes, e o `next dev`
 * reutiliza o que lá está: o resultado são manifestos incompatíveis e erros
 * como «Could not find the module … in the React Client Manifest» ou «Cannot
 * find module './383.js'» — que não dizem nada sobre a causa.
 *
 * `BUILD_ID` só existe depois de um `next build`. Se estiver lá, o directório
 * é de produção e não serve para desenvolver: deita-se fora e reconstrói-se.
 */
async function clearProductionBuild() {
  const next = new URL('../apps/web/.next/', import.meta.url);

  if (!existsSync(new URL('BUILD_ID', next))) return;

  console.info('Encontrado um build de produção em apps/web/.next; a limpar para o dev arrancar limpo.');
  await rm(new URL('.', next), { recursive: true, force: true });
}

async function ensureService(port, url, name, workspace) {
  if (await health(url, name)) { console.info(name + ' já está pronto; a reutilizar.'); return; }
  if (!await portAvailable(port)) {
    // A project watcher can be restarting. Give it time, but never kill an unknown listener.
    await waitFor(() => health(url, name), name + ' na porta ' + port + ' (ocupada)', 30_000);
    console.info(name + ' já está pronto; a reutilizar.'); return;
  }
  if (workspace === '@nadm/web') await clearProductionBuild();

  const script = workspace === '@nadm/web' ? 'dev:server' : 'dev';
  const child = launch('npm', ['run', script, '--workspace', workspace], {
    env: { ...process.env, NODE_ENV: 'development', PORT: '3333', API_INTERNAL_URL: API_URL },
  });
  child.on('error', error => { console.error(name + ': ' + error.message); stop(1); });
  child.on('exit', code => { if (!stopping) { console.error(name + ' terminou.'); stop(code || 1); } });
  await waitFor(async () => {
    if (stopping || child.exitCode !== null) throw new Error(name + ' não arrancou. Consulta os erros acima.');
    return health(url, name);
  }, name);
}

export async function main(args = process.argv.slice(2)) {
try {
  await loadLocalEnv();
  if (args.includes('--check')) {
    const web = await health(WEB_URL + '/health', 'nadm-web');
    const api = await health(API_URL + '/health', 'nadm-api');
    const proxy = await health(WEB_URL + '/api/health', 'nadm-api');
    console.info(JSON.stringify({ web: web ? 'ok' : 'indisponível', api: api ? 'ok' : 'indisponível', proxy: proxy ? 'ok' : 'indisponível', frontend: WEB_URL }, null, 2));
    process.exitCode = web && api && proxy ? 0 : 1;
  } else if (args.includes('--web-only')) {
    if (!await exists(resolve(ROOT, 'node_modules/next/package.json'))) throw new Error('Dependências em falta. Execute npm ci na raiz do projeto.');
    await ensureEnv('apps/web/.env.local', 'apps/web/.env.example');
    await ensureService(3001, WEB_URL + '/health', 'nadm-web', '@nadm/web');
    console.info('\nFrontend NaDM pronto: http://localhost:3001');
    if (!children.size) console.info('A instância existente foi reutilizada; não foi criado nenhum servidor duplicado.');
    if (!await health(WEB_URL + '/api/health', 'nadm-api')) console.info('A API está indisponível. Para iniciar o projeto completo, execute npm run dev na raiz do NaDM.');
  } else {
    if (!await exists(resolve(ROOT, 'node_modules/next/package.json'))) throw new Error('Dependências em falta. Execute npm ci na raiz do projeto.');
    await ensureEnv('apps/api/.env', 'apps/api/.env.example');
    await ensureEnv('apps/web/.env.local', 'apps/web/.env.example');
    if (!args.includes('--no-docker')) {
      console.info('A preparar o PostgreSQL do NaDM (sem apagar dados)…');
      await run('docker', ['compose', 'up', '-d', '--wait', '--wait-timeout', '60', 'postgres']);
    }
    await run('npm', ['run', 'db:generate', '--workspace', '@nadm/api']);
    await run('npm', ['run', 'db:migrate', '--workspace', '@nadm/api']);
    if (!args.includes('--setup-only')) {
      await ensureService(3333, API_URL + '/health', 'nadm-api', '@nadm/api');
      await ensureService(3001, WEB_URL + '/health', 'nadm-web', '@nadm/web');
      await waitFor(() => health(WEB_URL + '/api/health', 'nadm-api'), 'ligação frontend → API', 30_000);
      if (args.includes('--ngrok')) {
        const { startTunnel } = await import('./ngrok.mjs');
        const result = await startTunnel();
        ownedTunnel = result.started;
      }
      console.info('\nNaDM pronto: http://localhost:3001 · API ' + API_URL);
      console.info(children.size ? 'Ctrl+C encerra apenas os servidores iniciados por este comando.' : 'As instâncias existentes foram reutilizadas; não foi criado nenhum servidor duplicado.');
    } else console.info('Preparação concluída. Execute npm run dev ou npm run dev:full.');
  }
} catch (error) {
  console.error('\nFalha no arranque: ' + error.message);
  stop(1);
}
if (ownedTunnel && process.env.STOP_NGROK_ON_EXIT === 'true') {
  process.once('beforeExit', async () => { const { stopTunnel } = await import('./ngrok.mjs'); await stopTunnel(); });
}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) process.once(signal, () => stop(code));
  await main();
}
