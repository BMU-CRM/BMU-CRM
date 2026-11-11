import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Encrypts sensitive fields, such as Aadhaar and bank account numbers, before they are
// stored. AES-256-GCM with a fresh 12-byte nonce each time, so the same number never
// looks the same twice, and any tampering is detected on decryption.
//
// Stored form: "v1:" + base64(nonce | tag | ciphertext). The key is 32 random bytes in
// base64, in FIELD_ENCRYPTION_KEY. It never leaves the server.

const prefix = 'v1:';

export class EncryptionNotSetUpError extends Error {
  constructor() {
    super('Encryption is not set up. Add FIELD_ENCRYPTION_KEY to the server settings.');
  }
}

function readKey(raw = process.env.FIELD_ENCRYPTION_KEY) {
  if (!raw) return null;
  const key = Buffer.from(raw.trim(), 'base64');
  return key.length === 32 ? key : null;
}

export function isEncryptionReady() {
  return readKey() !== null;
}

export function encryptField(plain: string, rawKey?: string) {
  const key = readKey(rawKey);
  if (!key) throw new EncryptionNotSetUpError();
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const sealed = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return prefix + Buffer.concat([nonce, cipher.getAuthTag(), sealed]).toString('base64');
}

export function decryptField(stored: string, rawKey?: string) {
  const key = readKey(rawKey);
  if (!key) throw new EncryptionNotSetUpError();
  if (!stored.startsWith(prefix)) throw new Error('Unknown encrypted value.');
  const packed = Buffer.from(stored.slice(prefix.length), 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, packed.subarray(0, 12));
  decipher.setAuthTag(packed.subarray(12, 28));
  return Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString('utf8');
}
