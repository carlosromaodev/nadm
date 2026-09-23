import { spawn } from 'node:child_process';
import { readFile, writeFile, access } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const WEB_URL = 'http://127.0.0.1:3001';
export const API_URL = 'http://127.0.0.1:3333/api';
export const children = new Set();
export const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));
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
