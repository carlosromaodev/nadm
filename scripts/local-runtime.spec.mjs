import { describe, expect, it } from 'vitest';
import { publicUrl, selectTunnel, upsertEnvText } from './local-runtime.mjs';

describe('funções locais adaptadas do Bizy', () => {
  it('seleciona só o túnel HTTPS da porta NaDM e não o primeiro de outra app', () => {
    const unrelated = { public_url: 'https://other.ngrok.app', config: { addr: 'http://localhost:5173' } };
    const correct = { public_url: 'https://nadm.ngrok.app', config: { addr: 'http://127.0.0.1:3001' } };
    expect(selectTunnel([unrelated, correct])).toEqual(correct);
    expect(selectTunnel([unrelated])).toBeUndefined();
  });
  it('recusa destino remoto e túnel sem HTTPS', () => {
    expect(selectTunnel([{ public_url: 'https://bad.ngrok.app', config: { addr: 'http://remote.test:3001' } }])).toBeUndefined();
    expect(selectTunnel([{ public_url: 'http://bad.ngrok.app', config: { addr: 'http://localhost:3001' } }])).toBeUndefined();
  });
  it('aceita loopback localhost e ignora entradas inválidas', () => {
    const correct = { public_url: 'https://nadm.ngrok.app', config: { addr: 'http://localhost:3001' } };
    expect(selectTunnel([{}, correct])).toEqual(correct);
  });
  it('normaliza domínio sem permitir caminhos ou credenciais', () => {
    expect(publicUrl('example.ngrok-free.dev')).toBe('https://example.ngrok-free.dev');
    expect(publicUrl('https://example.ngrok.app/')).toBe('https://example.ngrok.app');
    for (const value of ['http://example.com', 'https://user:secret@example.com', 'https://example.com/api', 'https://example.com/?token=x']) expect(() => publicUrl(value)).toThrow();
  });
  it('sincroniza só a variável pretendida preservando as restantes', () => {
    const original = '# settings\nDATABASE_URL=private\nAPP_PUBLIC_URL=https://old.test\nKEEP=yes\n';
    expect(upsertEnvText(original, 'APP_PUBLIC_URL', 'https://new.test')).toBe('# settings\nDATABASE_URL=private\nAPP_PUBLIC_URL=https://new.test\nKEEP=yes\n');
  });
  it('adiciona uma variável uma só vez e rejeita injeção de novas linhas', () => {
    const first = upsertEnvText('KEEP=yes', 'APP_PUBLIC_URL', 'https://new.test');
    expect(upsertEnvText(first, 'APP_PUBLIC_URL', 'https://new.test')).toBe(first);
    expect(() => upsertEnvText(first, 'APP_PUBLIC_URL', 'https://new.test\nOTHER=x')).toThrow();
    expect(() => upsertEnvText(first, 'BAD=KEY', 'x')).toThrow();
  });
});
