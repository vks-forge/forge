/**
 * Opaque cursor for lists ordered by a timestamp then an id (the Inbox and the Runs list).
 *
 * Why: these screens page newest first and the next page must start exactly after the last
 *   row shown even when rows appear or change between requests (an offset would repeat or
 *   skip rows). The cursor carries that row's sort key. Clients treat it as an opaque string,
 *   so its shape can change, and a cursor that does not decode is a 400, never a query built
 *   from untrusted text.
 *
 * Exports: encodePageCursor(), decodePageCursor().
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

const CursorBody = z.strictObject({ a: z.iso.datetime(), i: z.string().min(1) });

/** Encodes the sort key (`at`, `id`) of the last row of a page. */
export function encodePageCursor(key: { at: string; id: string }): string {
  return Buffer.from(JSON.stringify({ a: key.at, i: key.id })).toString('base64url');
}

/** The key a cursor stands for, or null when it was not made by `encodePageCursor`. */
export function decodePageCursor(cursor: string): { at: string; id: string } | null {
  try {
    const raw: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const parsed = CursorBody.safeParse(raw);

    return parsed.success ? { at: parsed.data.a, id: parsed.data.i } : null;
  } catch {
    return null;
  }
}
