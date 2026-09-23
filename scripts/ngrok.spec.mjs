import { describe, expect, it } from 'vitest';
import { tunnelArguments } from './ngrok.mjs';

describe('ngrok sem login adicional', () => {
  it('aponta para o NaDM sem política nem credenciais Basic Auth', () => {
    const args = tunnelArguments();
    expect(args.slice(0, 2)).toEqual(['http', 'http://127.0.0.1:3001']);
    expect(args).toContain('--inspect=false');
    expect(args).toContain('--log');
    expect(args.join(' ')).not.toMatch(/basic-auth|traffic-policy|access\.json|policy\.json/);
  });
  it('mantém o domínio escolhido e rejeita credenciais na URL', () => {
    expect(tunnelArguments('nadm.ngrok.app').slice(-2)).toEqual(['--url', 'https://nadm.ngrok.app']);
    expect(() => tunnelArguments('https://user:password@nadm.ngrok.app')).toThrow();
  });
});
