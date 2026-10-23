/**
 * Tests for the ticket patch parser.
 *
 * Why: the ticket edit door changes a ticket's description or priority on their own. The
 *   schema gives `priority` a default of 0, so a patch that only names `body` must not come
 *   back carrying `priority: 0`, or editing a brief would silently drop a raised priority on
 *   both storage backends.
 *
 * Pins: keys absent from the patch stay absent; named keys (including a priority of 0 and an
 *   explicit clear) pass through; the version is expectedVersion + 1.
 * Depends on: src/shared/patches, vitest.
 */

import { describe, expect, it } from 'vitest';
import { parseTicketPatch } from '#/shared/patches.js';

describe('parseTicketPatch', () => {
  it('does not add a default priority to a patch that leaves it out', () => {
    const out = parseTicketPatch(3, { body: 'new brief' });

    expect(out).toEqual({ body: 'new brief', status_version: 4 });
    expect('priority' in out).toBe(false);
  });

  it('keeps named fields, including priority 0 and an explicit clear', () => {
    const out = parseTicketPatch(0, { priority: 0, blocked_reason: undefined });

    expect(out).toEqual({ priority: 0, blocked_reason: undefined, status_version: 1 });
  });
});
