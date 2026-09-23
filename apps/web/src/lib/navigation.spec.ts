import { describe, expect, it } from 'vitest';
import { isCreatorRoute, isPrivateRoute, loginHref, safeNext } from './navigation';

describe('navigation boundaries', () => {
  it('keeps a local deep link and its state after login', () => {
    expect(safeNext('/deals/abc/pagar?from=dm')).toBe('/deals/abc/pagar?from=dm');
    expect(loginHref('/ana/dm')).toBe('/entrar?next=%2Fana%2Fdm');
  });
  it.each(['https://evil.test', '//evil.test', '/\\evil.test', '/entrar', '/criar-perfil?next=/', '/\n/evil.test'])('rejects external redirects or loops: %s', value => {
    expect(safeNext(value)).toBe('/');
  });
  it('distinguishes owner pages from public profiles', () => {
    expect(isCreatorRoute('/estudio/agenda')).toBe(true);
    expect(isPrivateRoute('/deals/abc')).toBe(true);
    expect(isPrivateRoute('/nelsonbeats')).toBe(false);
    expect(isPrivateRoute('/descobrir')).toBe(false);
    expect(isPrivateRoute('/definicoes')).toBe(true);
    expect(isCreatorRoute('/definicoes')).toBe(false);
    expect(isPrivateRoute('/nelsonbeats/mimar')).toBe(false);
  });
});
