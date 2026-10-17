/**
 * Pins: the ticket stamp changes with anything that moves a ticket's pipeline and with nothing else.
 *
 * Why: the pipeline strip refetches when the stamp changes, because the engine does not announce
 * stage changes. A stamp that missed a status change would leave the strip stale; one that changed
 * on every render would refetch in a loop.
 * Depends on: domain/ticket-stamp.
 */

import { describe, expect, it } from 'vitest';
import { ticketStamp } from '#/domain/ticket-stamp.js';

const detail = (over: Record<string, unknown> = {}, runs = 1) =>
  ({
    ticket: {
      status: 'in_progress',
      updated_at: '2026-10-17T10:00:00.000Z',
      rework_count: 0,
      ...over,
    },
    runs: Array.from({ length: runs }, (_, i) => ({ id: `r${i}` })),
  }) as unknown as Parameters<typeof ticketStamp>[0];

describe('ticket stamp', () => {
  it('is the same for the same ticket and different when status, time, rework or runs move', () => {
    const base = ticketStamp(detail());

    expect(ticketStamp(detail())).toBe(base);
    expect(ticketStamp(detail({ status: 'verifying' }))).not.toBe(base);
    expect(ticketStamp(detail({ updated_at: '2026-10-17T10:00:01.000Z' }))).not.toBe(
      base,
    );

    expect(ticketStamp(detail({ rework_count: 1 }))).not.toBe(base);
    expect(ticketStamp(detail({}, 2))).not.toBe(base);
  });
});
