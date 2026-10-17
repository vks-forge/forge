/**
 * The trace sink: ordering, card attribution and fail-closed redaction.
 *
 * Why: the sink is the one door every trace source goes through (d-0163). It must stamp entries
 *   in the order they were emitted even though finding a card is asynchronous, put a ticket's
 *   or run's entries under the right card file, send card-less entries only to the day file,
 *   and never write an entry whose redaction failed. Emitting must never throw or block.
 *
 * Pins: seq and ts stamping, card from ticket and from run through ticket, explicit card kept,
 *   unknown ticket goes to the day file only, redacted data reaches the writer, a redaction
 *   crash drops the entry with one stderr warning, SecretStore values are removed, order is
 *   kept when lookups are slow.
 * Depends on: src/services/trace/trace-sink, src/services/trace/redact, vitest.
 */

import type { TraceEntry, TraceInput } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { createRedactor } from '#/services/trace/redact.js';
import { createTraceSink } from '#/services/trace/trace-sink.js';

const base: TraceInput = {
  level: 'info',
  kind: 'card_event',
  actor: 'engine',
  message: 'm',
  data: {},
};

function rig(over: Record<string, unknown> = {}) {
  const written: { entry: TraceEntry; card: string | undefined }[] = [];
  const warnings: string[] = [];
  let tick = 0;
  const sink = createTraceSink({
    write: (entry, card) => void written.push({ entry, card }),
    redactor: createRedactor(),
    secretValues: async () => ['SECRET-VALUE-FROM-STORE'],
    now: () => Date.UTC(2026, 9, 17, 10, 0, tick++),
    lookup: {
      cardOfTicket: async (id) => (id === 'FG-1' ? 'FG-C1' : undefined),
      ticketOfRun: async (id) => (id === 'run-1' ? 'FG-1' : undefined),
    },
    stderr: (t) => warnings.push(t),
    ...over,
  });

  return { sink, written, warnings, done: () => new Promise((r) => setTimeout(r, 20)) };
}

describe('trace sink', () => {
  it('stamps ts and seq in emit order', async () => {
    const { sink, written, done } = rig();
    sink.emit({ ...base, message: 'one' });
    sink.emit({ ...base, message: 'two' });
    await done();

    expect(written.map((w) => w.entry.seq)).toEqual([1, 2]);
    expect(written.map((w) => w.entry.message)).toEqual(['one', 'two']);
    expect(written[0]?.entry.ts).toBe('2026-10-17T10:00:00.000Z');
  });

  it('attributes a ticket entry to its card', async () => {
    const { sink, written, done } = rig();
    sink.emit({ ...base, ticket_id: 'FG-1' });
    await done();

    expect(written[0]?.card).toBe('FG-C1');
    expect(written[0]?.entry.card_id).toBe('FG-C1');
  });

  it('attributes a run entry through its ticket to the card', async () => {
    const { sink, written, done } = rig();
    sink.emit({ ...base, kind: 'run_event', run_id: 'run-1' });
    await done();

    expect(written[0]?.entry.ticket_id).toBe('FG-1');
    expect(written[0]?.card).toBe('FG-C1');
  });

  it('keeps an explicit card and puts card-less entries in the day file only', async () => {
    const { sink, written, done } = rig();
    sink.emit({ ...base, card_id: 'FG-C9' });
    sink.emit({ ...base, ticket_id: 'NOPE-1' });
    sink.emit({ ...base });
    await done();

    expect(written.map((w) => w.card)).toEqual(['FG-C9', undefined, undefined]);
  });

  it('writes redacted data and removes SecretStore values', async () => {
    const { sink, written, done } = rig();
    sink.emit({
      ...base,
      message: 'has SECRET-VALUE-FROM-STORE',
      data: { Authorization: 'Bearer abcdefghijklmnopqrstuv', ok: 'fine' },
    });
    await done();

    const text = JSON.stringify(written[0]?.entry);

    expect(text).not.toContain('SECRET-VALUE-FROM-STORE');
    expect(text).not.toContain('abcdefghijklmnopqrstuv');
    expect(text).toContain('fine');
  });

  it('drops an entry whose redaction throws and warns once', async () => {
    const { sink, written, warnings, done } = rig({
      redactor: {
        redact: () => {
          throw new Error('redact broke');
        },
      },
    });

    sink.emit({ ...base, message: 'secret thing' });
    sink.emit({ ...base, message: 'another' });
    await done();

    expect(written).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).not.toContain('secret thing');
  });

  it('keeps order when an earlier lookup is slower than a later one', async () => {
    const { sink, written, done } = rig({
      lookup: {
        cardOfTicket: async (id: string) => {
          if (id === 'FG-1') {
            await new Promise((r) => setTimeout(r, 15));
          }

          return 'FG-C1';
        },
        ticketOfRun: async () => undefined,
      },
    });

    sink.emit({ ...base, message: 'slow', ticket_id: 'FG-1' });
    sink.emit({ ...base, message: 'fast', ticket_id: 'FG-2' });
    await done();
    await done();

    expect(written.map((w) => w.entry.message)).toEqual(['slow', 'fast']);
  });

  it('never throws from emit even when lookups fail', async () => {
    const { sink, written, done } = rig({
      lookup: {
        cardOfTicket: async () => {
          throw new Error('db gone');
        },
        ticketOfRun: async () => undefined,
      },
    });

    expect(() => sink.emit({ ...base, ticket_id: 'FG-1' })).not.toThrow();
    await done();

    expect(written).toHaveLength(1);
    expect(written[0]?.card).toBeUndefined();
  });
});
