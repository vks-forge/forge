/**
 * HMAC and hash helpers — the only place `node:crypto` is touched, shared by every package.
 *
 * Why: catalogue signatures, receipt chains and run bearer tokens must be verifiable by the
 *   Director but unforgeable by a Worker, which never sees the keys. One small module means
 *   every signature uses the same algorithm (HMAC-SHA256, hex), every secret comparison is
 *   constant time (digest both sides first, so neither content nor length leaks), and no key
 *   shorter than 32 bytes can sign anything: a weak or empty key makes a "signed" catalogue or
 *   receipt chain forgeable offline. Hooks and the MCP server import these instead of keeping
 *   their own copies (verification-plane.md §2, tool-system.md §10).
 *
 * Exports: MIN_KEY_BYTES, hmacHex(), sha256Hex(), hashToken(), constantTimeEqual(), assertStrongKey().
 * Depends on: node:crypto, @forge/core (InvalidInputError). No IO.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { InvalidInputError } from '@forge/core';

/** Shortest HMAC key accepted (SHA-256 block-safe, matches the digest size). */
export const MIN_KEY_BYTES = 32;

/** Throws when `key` is shorter than {@link MIN_KEY_BYTES} bytes (UTF-8 for strings). */
export function assertStrongKey(key: string | Uint8Array): void {
  const bytes = typeof key === 'string' ? Buffer.byteLength(key, 'utf8') : key.length;
  if (bytes < MIN_KEY_BYTES) {
    throw new InvalidInputError(`HMAC key must be at least ${MIN_KEY_BYTES} bytes`);
  }
}

/** HMAC-SHA256 of `data` under `key`, lowercase hex. Throws on a key under 32 bytes. */
export function hmacHex(key: string | Uint8Array, data: string): string {
  assertStrongKey(key);
  return createHmac('sha256', key).update(data, 'utf8').digest('hex');
}

/** SHA-256 of `data`, lowercase hex. */
export function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/** What is stored for a bearer token: its SHA-256 hex. The token itself is never stored. */
export function hashToken(token: string): string {
  return sha256Hex(token);
}

/** Constant-time string equality: both sides are digested first, so lengths never leak. */
export function constantTimeEqual(a: string, b: string): boolean {
  const da = createHash('sha256').update(a, 'utf8').digest();
  const db = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(da, db);
}
