import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

function scrypt(password: string, salt: Buffer, keylen: number, N: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, { N, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** Format: scrypt$N$salt$hash (base64). Parameter stehen im Hash, damit sie später erhöht werden können. */
export async function hashPassword(password: string, logN: number): Promise<string> {
  const salt = randomBytes(16);
  const N = 2 ** logN;
  const key = await scrypt(password.normalize('NFKC'), salt, 64, N);
  return `scrypt$${N}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [alg, n, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !n || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length, Number(n));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export const sha256 = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const hmac = (secret: string, data: string, enc: 'hex' | 'base64' = 'hex') =>
  createHmac('sha256', secret).update(data).digest(enc);

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
