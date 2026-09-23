import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { ResourceNotFoundError } from '@/core/errors/domain-error';
import { MediaUrlSigner, PrivateMediaStorage, type MediaClaims } from '../application/ports/content.repository';

export const MEDIA_DIRECTORY = resolve(__dirname, '../../../../var/media');
const STORAGE_KEY = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const claimsSchema = z.object({ mediaId: z.string().uuid(), actorUserId: z.string().uuid().nullable(), contentId: z.string().uuid().nullable(),
  expiresAt: z.number().int().positive() }).strict();

export class LocalPrivateMediaStorage extends PrivateMediaStorage {
  constructor(private readonly directory = MEDIA_DIRECTORY) { super(); }
  private path(key: string) {
    if (!STORAGE_KEY.test(key)) throw new ResourceNotFoundError('Media', 'invalid');
    return resolve(this.directory, key);
  }
  async write(key: string, bytes: Uint8Array) {
    const target = this.path(key);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await writeFile(target, bytes, { mode: 0o600, flag: 'wx' });
  }
  async read(key: string) {
    try { return await readFile(this.path(key)); }
    catch { throw new ResourceNotFoundError('Media', 'unavailable'); }
  }
  async remove(key: string) {
    try { await unlink(this.path(key)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}

/** Chave persistida fora do webroot; nunca entra em respostas, logs ou controlo de versão. */
export class LocalMediaUrlSigner extends MediaUrlSigner {
  private keyPromise: Promise<Buffer> | undefined;
  constructor(private readonly directory = MEDIA_DIRECTORY) { super(); }
  private key() {
    this.keyPromise ??= (async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const path = resolve(this.directory, '.signing-key');
      try { await writeFile(path, randomBytes(32), { flag: 'wx', mode: 0o600 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      const key = await readFile(path);
      if (key.length !== 32) throw new Error('A chave privada de media está inválida.');
      return key;
    })();
    return this.keyPromise;
  }
  async sign(claims: MediaClaims) {
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = createHmac('sha256', await this.key()).update(payload).digest('base64url');
    return `/api/media/${claims.mediaId}?token=${payload}.${signature}`;
  }
  async verify(token: string): Promise<MediaClaims | null> {
    if (token.length > 1500) return null;
    const parts = token.split('.');
    if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) return null;
    const [payload, signature] = parts;
    const expected = createHmac('sha256', await this.key()).update(payload).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    try {
      const parsed = claimsSchema.safeParse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
      return parsed.success ? parsed.data : null;
    } catch { return null; }
  }
}
