/**
 * Bearer parsing and constant-time token comparison.
 *
 * Why: the install token is the only thing between another local process and the control
 *   plane. Comparing with `===` leaks how many leading characters matched through timing,
 *   so both sides are hashed to equal length and compared with `timingSafeEqual`. A missing
 *   or malformed header is simply "no token", never an error with detail.
 *
 * Exports: bearerOf(), tokensEqual().
 * Depends on: node:crypto. No IO.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

const BEARER = /^Bearer (.+)$/i;

/** The token in an `Authorization: Bearer <token>` header, or undefined. */
export function bearerOf(header: string | undefined): string | undefined {
  return BEARER.exec(header ?? '')?.[1]?.trim();
}

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

/** Constant-time equality of two secrets of any length. */
export function tokensEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}
