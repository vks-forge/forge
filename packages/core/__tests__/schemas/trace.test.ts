/**
 * Tests for the debug trace entry schema and the no-op sink.
 *
 * Why: every trace file line is one `TraceEntry`; if the shape drifts, the day file and the
 *   per-card files stop being greppable by kind and card, and a Director step could be
 *   logged without saying which step it was. The no-op sink is what the engine and adapters
 *   hold when tracing is off, so it must accept every entry and do nothing.
 *
 * Pins: required fields, the closed kind and actor lists, optional ids, free-form data,
 *   NOOP_TRACE swallowing entries.
 * Depends on: src/schemas/trace, src/domain/trace, vitest.
 */

import { describe, expect, it } from 'vitest';
import { NOOP_TRACE } from '#/domain/trace.js';
import { TRACE_KINDS, TraceEntry, TraceInput } from '#/schemas/trace.js';

const entry = {
  ts: '2026-10-17T10:00:00.000Z',
  seq: 1,
  level: 'info',
  kind: 'card',
  actor: 'owner',
  message: 'card created',
  data: { title: 'x' },
};

describe('TraceEntry', () => {
  it('accepts a full entry and keeps optional ids', () => {
    const parsed = TraceEntry.parse({
      ...entry,
      card_id: 'FX-C1',
      ticket_id: 'FX-1',
      run_id: 'r1',
      project: 'fx',
      step: 'triage',
    });

    expect(parsed.card_id).toBe('FX-C1');
    expect(parsed.step).toBe('triage');
  });

  it('lists every source the brief names', () => {
    expect(TRACE_KINDS).toEqual(
      expect.arrayContaining([
        'http',
        'card_event',
        'director_step',
        'run_event',
        'error',
      ]),
    );
  });

  it('rejects an unknown kind, actor or level', () => {
    expect(TraceEntry.safeParse({ ...entry, kind: 'nope' }).success).toBe(false);
    expect(TraceEntry.safeParse({ ...entry, actor: 'bob' }).success).toBe(false);
    expect(TraceEntry.safeParse({ ...entry, level: 'trace' }).success).toBe(false);
  });

  it('rejects an entry with no message', () => {
    const { message: _message, ...rest } = entry;
    void _message;

    expect(TraceEntry.safeParse(rest).success).toBe(false);
  });

  it('TraceInput is an entry without ts and seq', () => {
    const { ts: _ts, seq: _seq, ...input } = entry;
    void _ts;
    void _seq;

    expect(TraceInput.safeParse(input).success).toBe(true);
  });
});

describe('NOOP_TRACE', () => {
  it('accepts entries and returns nothing', () => {
    const { ts: _ts, seq: _seq, ...input } = entry;
    void _ts;
    void _seq;

    expect(NOOP_TRACE.emit(TraceInput.parse(input))).toBeUndefined();
  });
});
