/**
 * HMAC and hash helpers — the only place `node:crypto` is touched.
 *
 * Why: catalogue signatures and receipt chains must be verifiable by the Director but
 *   unforgeable by a Worker, which never sees the keys. Keeping the primitives in one
 *   small module means every signature uses the same algorithm (HMAC-SHA256, hex) and a
 *   constant-time comparison, so no caller can accidentally compare MACs with `===` and
 *   leak timing (verification-plane.md §2, tool-system.md §10).
 *
 * Exports: hmacHex(), sha256Hex(), safeEqualHex().
 * Depends on: node:crypto. No IO.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** HMAC-SHA256 of `data` under `key`, lowercase hex. */
export function hmacHex(key: string | Uint8Array, data: string): string {
  return createHmac('sha256', key).update(data, 'utf8').digest('hex');
}

/** SHA-256 of `data`, lowercase hex. */
export function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/** Constant-time equality of two hex strings; false on any length mismatch. */
export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
