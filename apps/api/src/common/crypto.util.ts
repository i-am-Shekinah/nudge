import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 12 bytes recommended for GCM

/**
 * Ensures the encryption key is exactly 32 bytes (256 bits).
 * Supports both 64-character hex strings and 32-character utf8 strings.
 */
function getKeyBuffer(key: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(key)) {
    return Buffer.from(key, 'hex');
  }
  const buf = Buffer.from(key, 'utf8');
  if (buf.length === 32) {
    return buf;
  }
  // Fallback / hash padding to 32 bytes if key is not exactly 32 bytes
  const padded = Buffer.alloc(32);
  buf.copy(padded, 0, 0, Math.min(buf.length, 32));
  return padded;
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Output format: `<iv_hex>:<auth_tag_hex>:<ciphertext_hex>`
 */
export function encryptToken(text: string, key: string): string {
  if (!text) return '';
  const keyBuffer = getKeyBuffer(key);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, keyBuffer, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts ciphertext formatted as `<iv_hex>:<auth_tag_hex>:<ciphertext_hex>` using AES-256-GCM.
 */
export function decryptToken(cipherPayload: string, key: string): string {
  if (!cipherPayload) return '';
  const parts = cipherPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format. Expected iv:authTag:ciphertext');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const keyBuffer = getKeyBuffer(key);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
