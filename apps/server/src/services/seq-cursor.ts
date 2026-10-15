/**
 * Opaque cursor for lists numbered by a per-parent `seq` (a card's history).
 *
 * Why: history is read oldest first in pages, and the next page must start exactly after the
 *   last entry shown even while new entries are appended. The cursor carries that entry's
 *   `seq`. Clients treat it as an opaque string, and one that does not decode is a 400, never
 *   a query built from untrusted text.
 *
 * Exports: encodeSeqCursor(), decodeSeqCursor().
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

const CursorBody = z.strictObject({ s: z.number().int().nonnegative() });

/** Encodes the `seq` of the last entry on a page. */
export function encodeSeqCursor(seq: number): string {
  return Buffer.from(JSON.stringify({ s: seq })).toString('base64url');
}

/** The `seq` a cursor stands for, or null when it was not made by `encodeSeqCursor`. */
export function decodeSeqCursor(cursor: string): number | null {
  try {
    const raw: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const parsed = CursorBody.safeParse(raw);

    return parsed.success ? parsed.data.s : null;
  } catch {
    return null;
  }
}
