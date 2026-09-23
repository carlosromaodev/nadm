import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, open, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { ROOT, WEB_URL, health, loadLocalEnv, publicUrl, selectTunnel, upsertEnv, waitFor } from './local-runtime.mjs';

const directory = resolve(ROOT, '.ngrok');
// Recognise the old protected agent only so it can be stopped safely during migration.
const accessFile = resolve(directory, 'access.json');
const policyFile = resolve(directory, 'policy.json');
const stateFile = resolve(directory, 'agent.json');
const logFile = resolve(directory, 'agent.log');
const inspector = () => process.env.NGROK_API_URL ?? 'http://127.0.0.1:4040/api/tunnels';

async function state() { try { return JSON.parse(await readFile(stateFile, 'utf8')); } catch { return null; } }
async function ownsProcess(record) {
  if (!record || record.project !== ROOT || !Number.isInteger(record.pid) || record.pid <= 1) return false;
  try {
    const args = (await readFile('/proc/' + record.pid + '/cmdline', 'utf8')).split('\0');
    return (args.includes(policyFile) || args.includes(logFile)) && args.includes(WEB_URL) && args.some(arg => /(^|\/)ngrok$/.test(arg));
  } catch { return false; }
}
async function tunnels() {
  try {
    const url = new URL(inspector());
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('O inspector ngrok tem de ser local.');
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return response.ok ? (await response.json()).tunnels ?? [] : [];
  } catch { return []; }
}
export function tunnelArguments(domain) {
  const args = ['http', WEB_URL, '--name=nadm', '--inspect=false', '--log', logFile, '--log-format=json'];
  if (domain) args.push('--url', publicUrl(domain));
  return args;
}
export async function syncTunnelUrl(tunnel) {
  const chosen = tunnel ?? selectTunnel(await tunnels());
  if (!chosen) throw new Error('Nenhum túnel HTTPS aponta para o NaDM na porta 3001. Execute npm run ngrok.');
  const url = publicUrl(chosen.public_url);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  for (const path of ['.env', 'apps/api/.env', 'apps/web/.env.local']) await upsertEnv(resolve(ROOT, path), 'APP_PUBLIC_URL', url);
  await upsertEnv(resolve(ROOT, '.env'), 'BACKEND_PUBLIC_URL', url + '/api');
  await writeFile(resolve(directory, 'public-url'), url + '\n', { mode: 0o600 });
  console.info('URL pública NaDM: ' + url);
  console.info('Frontend e API usam o mesmo domínio, sem login adicional do ngrok.');
  return url;
}
export async function stopTunnel() {
  const record = await state();
  if (!await ownsProcess(record)) {
    console.info('Nenhum agente ngrok pertencente a este projeto foi encontrado. Outros processos não foram alterados.');
    return;
  }
  process.kill(record.pid, 'SIGTERM');
  await waitFor(async () => !await ownsProcess(record), 'encerramento do túnel NaDM', 10_000);
  await unlink(stateFile).catch(() => {});
  console.info('Túnel NaDM encerrado. Nenhum túnel de outro projeto foi terminado.');
}
async function removeLegacyProtection() {
  await Promise.all([accessFile, policyFile].map(path => unlink(path).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  })));
}
export async function startTunnel(domain) {
  await loadLocalEnv();
  if (process.env.NGROK_PORT && process.env.NGROK_PORT !== '3001') throw new Error('O túnel NaDM deve apontar à porta 3001. Corrige NGROK_PORT no .env deste projeto.');
  if (!await health(WEB_URL + '/health', 'nadm-web') || !await health(WEB_URL + '/api/health', 'nadm-api')) throw new Error('O NaDM não está pronto na porta 3001. Execute npm run dev antes do ngrok.');
  const requested = domain ?? process.env.NADM_NGROK_URL ?? process.env.NGROK_DOMAIN;
  const requestedUrl = requested ? publicUrl(requested) : null;
  const existing = await tunnels();
  const matching = selectTunnel(existing);
  const previous = await state();
  if (matching) {
    if (!await ownsProcess(previous)) throw new Error('Existe um túnel para a porta 3001, mas não foi criado pelo script deste projeto. Não o alterei; encerra-o voluntariamente antes de executar este comando.');
    if (requestedUrl && matching.public_url !== requestedUrl) throw new Error('Outro domínio NaDM está ativo. Execute npm run ngrok:stop antes de mudar o domínio.');
    console.info('A reutilizar o túnel NaDM já ativo.');
    return { started: false, url: await syncTunnelUrl(matching) };
  }
  if (existing.length) throw new Error('Já há um ngrok de outro projeto em execução. Não o interrompi. Encerra esse túnel antes de iniciar o do NaDM.');
  if (spawnSync('ngrok', ['config', 'check'], { stdio: 'ignore' }).status !== 0) throw new Error('ngrok não está configurado. Reutiliza a conta instalada ou executa ngrok config add-authtoken no teu terminal.');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await removeLegacyProtection();
  const args = tunnelArguments(requestedUrl);
  const log = await open(logFile, 'a', 0o600);
  const child = spawn('ngrok', args, { cwd: ROOT, detached: true, stdio: ['ignore', log.fd, log.fd], env: process.env });
  let error;
  child.once('error', reason => { error = reason; });
  await new Promise((resolveSpawn, reject) => { child.once('spawn', resolveSpawn); child.once('error', reject); }).finally(() => log.close());
  child.unref();
  await writeFile(stateFile, JSON.stringify({ pid: child.pid, project: ROOT, target: WEB_URL }, null, 2), { mode: 0o600 });
  console.info('A abrir ngrok para NaDM sem palavra-passe. Qualquer pessoa com o link pode aceder à demonstração. Logs locais: .ngrok/agent.log');
  try {
    await waitFor(async () => {
      if (error || child.exitCode !== null) throw new Error('ngrok não iniciou. Consulta .ngrok/agent.log (conta, domínio ou limite de túneis).');
      return Boolean(selectTunnel(await tunnels()));
    }, 'túnel ngrok', 45_000);
    return { started: true, url: await syncTunnelUrl() };
  } catch (reason) { await stopTunnel(); throw reason; }
}
async function main() {
  await loadLocalEnv();
  if (process.argv.includes('--access')) {
    console.info('O túnel NaDM já não exige utilizador nem palavra-passe do ngrok.');
  } else if (process.argv.includes('--stop')) await stopTunnel();
  else if (process.argv.includes('--sync')) await syncTunnelUrl();
  else {
    const index = process.argv.indexOf('--domain');
    if (index >= 0 && !process.argv[index + 1]) throw new Error('Uso: npm run ngrok:domain -- seu-dominio.ngrok-free.app');
    await startTunnel(index >= 0 ? process.argv[index + 1] : undefined);
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { console.error('ngrok: ' + error.message); process.exitCode = 1; });
}
