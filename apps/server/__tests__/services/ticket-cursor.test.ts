/**
 * The ticket list cursor round-trips and refuses anything this server did not issue.
 *
 * Why: a cursor arrives from the URL. It must decode to exactly the sort key it was made
 * from (or pages skip cards), and garbage must be refused rather than reach the query.
 *
 * Pins: encode/decode round trip; non-base64, non-JSON, wrong-shape and extra-key input
 * all decode to null.
 * Depends on: src/services/ticket-cursor.
 */

import type { TicketId } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { decodeTicketCursor, encodeTicketCursor } from '#/services/ticket-cursor.js';

const KEY = { updated_at: '2026-10-13T00:01:00.000Z', id: 'FX-7' as TicketId };

describe('ticket cursor', () => {
  it('decodes to the key it was made from', () => {
    expect(decodeTicketCursor(encodeTicketCursor(KEY))).toEqual(KEY);
  });

  it('refuses text that is not a cursor', () => {
    const forge = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const bad = [
      'not-a-cursor',
      '',
      forge({ u: 'yesterday', i: 'FX-1' }),
      forge({ u: KEY.updated_at, i: 'x; DROP TABLE' }),
      forge({ u: KEY.updated_at, i: 'FX-1', extra: 1 }),
      forge('FX-1'),
    ];

    expect(bad.map((c) => decodeTicketCursor(c))).toEqual(bad.map(() => null));
  });
});
