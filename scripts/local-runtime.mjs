import { execFile, spawn } from 'node:child_process';
import { readFile, writeFile, access, readlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { promisify } from 'node:util';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const WEB_URL = 'http://127.0.0.1:3001';
export const API_URL = 'http://127.0.0.1:3333/api';
export const children = new Set();
export const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));
const execFileAsync = promisify(execFile);
export async function exists(path) { try { await access(path); return true; } catch { return false; } }

/** Read dotenv values without executing a shell script or exposing secrets. */
export async function loadLocalEnv() {
  const path = resolve(ROOT, '.env');
  if (!await exists(path)) return;
  const { parseEnv } = await import('node:util');
  for (const [key, value] of Object.entries(parseEnv(await readFile(path, 'utf8')))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
export function launch(command, args, options = {}) {
  const child = spawn(command, args, { cwd: ROOT, stdio: 'inherit', detached: process.platform !== 'win32', ...options });
  children.add(child);
  child.on('exit', () => children.delete(child));
  child.on('error', () => children.delete(child));
  return child;
}
export function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = launch(command, args, options);
    child.once('error', () => reject(new Error(`Não foi possível executar ${command}. Confirma a instalação e permissões.`)));
    child.once('exit', (code, signal) => code === 0 ? resolveRun() : reject(new Error(`${command} ${args.join(' ')} terminou com ${signal ?? code}. Consulta o erro acima.`)));
  });
}
export function stopChildren() {
  for (const child of children) {
    if (!child.pid) continue;
    try { process.platform === 'win32' ? child.kill('SIGTERM') : process.kill(-child.pid, 'SIGTERM'); } catch { /* Already stopped. */ }
  }
}
export async function portAvailable(port) {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', error => error.code === 'EADDRINUSE' ? resolvePort(false) : reject(new Error(`Não foi possível verificar a porta ${port}: ${error.code}.`)));
    server.listen(port, '127.0.0.1', () => server.close(() => resolvePort(true)));
  });
}

async function linuxProcess(pid) {
  try {
    const [cwd, cmdline, stat] = await Promise.all([
      readlink(`/proc/${pid}/cwd`),
      readFile(`/proc/${pid}/cmdline`),
      readFile(`/proc/${pid}/stat`, 'utf8'),
    ]);
    const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
    return {
      pid,
      cwd,
      command: cmdline.toString('utf8').replaceAll('\0', ' ').trim(),
      processGroup: Number(fields[2]),
    };
  } catch { return null; }
}

async function linuxPortOwners(port) {
  try {
    const { stdout } = await execFileAsync('fuser', ['-n', 'tcp', String(port)]);
    return [...new Set(stdout.trim().split(/\s+/).map(Number).filter(Number.isSafeInteger))];
  } catch (error) {
    // `fuser` usa código 1 para "ninguém está a usar esta porta".
    if (error?.code === 1) return [];
    return null;
  }
}

function inside(path, parent) {
  const normalizedPath = resolve(path);
  const normalizedParent = resolve(parent);
  return normalizedPath === normalizedParent || normalizedPath.startsWith(normalizedParent + sep);
}

/**
 * Liberta uma porta somente quando todos os listeners são watchers deste
 * repositório e do workspace esperado. Nunca termina processos desconhecidos.
 */
export async function reclaimProjectPort(port, name, workspace) {
  if (process.platform !== 'linux') return false;
  const pids = await linuxPortOwners(port);
  if (!pids?.length) return await portAvailable(port);

  const workspaceDir = resolve(ROOT, 'apps', workspace === '@nadm/web' ? 'web' : 'api');
  const expected = workspace === '@nadm/web' ? /(?:next(?:-server)?|node .*next)/i : /(?:nest|node .*main)/i;
  const owners = await Promise.all(pids.map(linuxProcess));
  if (owners.some(owner => !owner || !inside(owner.cwd, workspaceDir) || !expected.test(owner.command))) return false;

  const groups = [...new Set(owners.map(owner => owner.processGroup).filter(group => group > 1))];
  for (const group of groups) {
    const leader = await linuxProcess(group);
    if (!leader || !inside(leader.cwd, ROOT) || !/(?:npm|node|next|nest)/i.test(leader.command)) return false;
  }

  console.info(`${name} antigo detectado na porta ${port}; a encerrar o watcher obsoleto deste projeto.`);
  for (const group of groups) {
    try { process.kill(-group, 'SIGTERM'); } catch { /* Já terminou. */ }
  }
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await portAvailable(port)) return true;
    await delay(100);
  }

  // Um watcher confirmado como nosso pode ter ficado preso a ignorar SIGTERM.
  for (const group of groups) {
    try { process.kill(-group, 'SIGKILL'); } catch { /* Já terminou. */ }
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await portAvailable(port)) return true;
    await delay(100);
  }
  return false;
}
export async function health(url, service) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
    if (!response.ok) return false;
    const value = await response.json();
    return value.service === service && value.status === 'ok';
  } catch { return false; }
}
export async function waitFor(check, label, timeoutMs = 120_000) {
  const start = Date.now();
  let announced = 0;
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    if (Date.now() - announced > 15_000) { console.info(`A aguardar ${label}…`); announced = Date.now(); }
    await delay(1000);
  }
  throw new Error(`${label} não ficou pronto. Verifica os erros acima; o arranque foi interrompido.`);
}
export function upsertEnvText(source, key, value) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(key) || /[\r\n]/.test(value)) throw new Error('Variável de ambiente inválida.');
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  return pattern.test(source) ? source.replace(pattern, () => line) : `${source}${source && !source.endsWith('\n') ? '\n' : ''}${line}\n`;
}
export async function upsertEnv(path, key, value) {
  const source = await readFile(path, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
  await writeFile(path, upsertEnvText(source, key, value), { mode: 0o600 });
}
export function publicUrl(value) {
  const url = new URL(value.includes('://') ? value : `https://${value}`);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('O domínio deve ser um endereço HTTPS sem caminho, credenciais ou parâmetros.');
  return url.origin;
}
export function selectTunnel(tunnels, target = WEB_URL) {
  return tunnels.find(tunnel => {
    try {
      const addr = new URL(tunnel.config?.addr);
      return ['localhost', '127.0.0.1', '[::1]'].includes(addr.hostname) && addr.port === new URL(target).port && tunnel.public_url?.startsWith('https://');
    } catch { return false; }
  });
}
