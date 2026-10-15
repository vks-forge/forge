/**
 * Opaque cursor for the project ticket list.
 *
 * Why: the Board pages through a project's tickets ordered by `updated_at` then `id`, and
 *   the next page must start exactly after the last card shown, even when tickets change
 *   between requests (an offset would repeat or skip cards). The cursor carries that last
 *   row's sort key. Clients must treat it as an opaque string; hiding the shape lets it
 *   change without breaking them, and a cursor that does not decode is a 400, never a
 *   query built from untrusted text.
 *
 * Exports: encodeTicketCursor(), decodeTicketCursor().
 * Depends on: @forge/core (TicketId, TicketListKey), zod. No IO.
 */

import { TicketId } from '@forge/core';
import type { TicketListKey } from '@forge/core';
import { z } from 'zod';

const CursorBody = z.strictObject({ u: z.iso.datetime(), i: TicketId });

/** Encodes the sort key of the last ticket on a page. */
export function encodeTicketCursor(key: TicketListKey): string {
  return Buffer.from(JSON.stringify({ u: key.updated_at, i: key.id })).toString(
    'base64url',
  );
}

/** The key a cursor stands for, or null when it was not made by `encodeTicketCursor`. */
export function decodeTicketCursor(cursor: string): TicketListKey | null {
  try {
    const raw: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const parsed = CursorBody.safeParse(raw);

    return parsed.success ? { updated_at: parsed.data.u, id: parsed.data.i } : null;
  } catch {
    return null;
  }
}
