// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createProfileQr, profileShareUrl } from './profile-share';

describe('profile sharing', () => {
  it('uses the active origin and the real handle, not the prototype account', () => {
    expect(profileShareUrl('https://nadm.example/path?token=private', 'maria')).toBe('https://nadm.example/maria');
    expect(profileShareUrl('http://localhost:3001', 'creator_2')).toBe('http://localhost:3001/creator_2');
  });
  it('rejects unsafe protocols and path injection', () => {
    expect(() => profileShareUrl('javascript:alert(1)', 'maria')).toThrow();
    expect(() => profileShareUrl('https://nadm.example', '../admin')).toThrow();
  });
  it('generates a real local QR PNG, unique to each URL', async () => {
    const first = await createProfileQr('https://nadm.example/maria');
    const second = await createProfileQr('https://nadm.example/joana');
    expect(first).toMatch(/^data:image\/png;base64,iVBOR/);
    expect(first).not.toBe(second);
  });
});
