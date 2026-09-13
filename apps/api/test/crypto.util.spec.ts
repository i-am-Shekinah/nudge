import { describe, it, expect } from 'vitest';
import { encryptToken, decryptToken } from '../src/common/crypto.util.js';

describe('crypto.util (AES-256-GCM)', () => {
  const secretKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  it('should successfully encrypt and decrypt a sample OAuth token', () => {
    const rawToken = 'ya29.a0AfH6SMD_random_google_oauth_token_1234567890';
    const encrypted = encryptToken(rawToken, secretKey);

    expect(encrypted).not.toBe(rawToken);
    expect(encrypted.split(':').length).toBe(3);

    const decrypted = decryptToken(encrypted, secretKey);
    expect(decrypted).toBe(rawToken);
  });

  it('should produce different ciphertexts for the same plaintext due to random IV', () => {
    const rawToken = 'ya29.same_token_multiple_encryptions';
    const enc1 = encryptToken(rawToken, secretKey);
    const enc2 = encryptToken(rawToken, secretKey);

    expect(enc1).not.toBe(enc2);
    expect(decryptToken(enc1, secretKey)).toBe(rawToken);
    expect(decryptToken(enc2, secretKey)).toBe(rawToken);
  });

  it('should throw error when decrypting with wrong key or tampered ciphertext', () => {
    const rawToken = 'super_secret_token';
    const encrypted = encryptToken(rawToken, secretKey);
    const wrongKey = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

    expect(() => decryptToken(encrypted, wrongKey)).toThrow();
  });
});
