/**
 * Pins: the thread reducer turns every kind of run event into the right item, pairs a tool
 * result with its call, ignores replays, and drops machine noise.
 *
 * Why: the live thread is built from a stream that is replayed after a reconnect. A
 *   duplicated line, a tool call stuck "running" forever, or a permission denial that never
 *   shows would each mislead a user watching a Worker. Also pins run status and interaction
 *   wording, and the time labels.
 * Depends on: src/domain/thread, src/domain/run-status, src/domain/interaction,
 *   src/domain/format-time. Pure.
 */

import { RunEvent, RunStatus } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { clockTime, timeAgo } from '#/domain/relative-time.js';
import { promptOf, quickReplies } from '#/domain/interaction.js';
import { isRunLive, RUN_STATUS_LABEL, runTone } from '#/domain/run-status.js';
import { applyEvent, applyEvents, EMPTY_THREAD, pendingAsk } from '#/domain/thread.js';

const ts = '2026-10-16T10:00:00.000Z';
const ev = (seq: number, rest: Record<string, unknown>): RunEvent =>
  RunEvent.parse({ seq, ts, ...rest });

describe('applyEvent', () => {
  it('shows text, pairs a tool call with its result and marks failures', () => {
    const state = applyEvents(EMPTY_THREAD, [
      ev(1, { type: 'text', text: 'hello' }),
      ev(2, { type: 'tool_call', call_id: 'c1', name: 'Bash', input: { command: 'ls' } }),
      ev(3, { type: 'tool_result', call_id: 'c1', output: 'boom', is_error: true }),
    ]);

    expect(state.items).toHaveLength(2);
    expect(state.items[0]).toMatchObject({ kind: 'message', text: 'hello' });
    expect(state.items[1]).toMatchObject({
      kind: 'tool',
      name: 'Bash',
      done: true,
      isError: true,
      output: 'boom',
    });
  });

  it('keeps a tool call open until its result arrives', () => {
    const state = applyEvent(
      EMPTY_THREAD,
      ev(1, { type: 'tool_call', call_id: 'c1', name: 'Read', input: {} }),
    );

    expect(state.items[0]).toMatchObject({ kind: 'tool', done: false });
  });

  it('shows a result whose call was never seen instead of dropping it', () => {
    const state = applyEvent(
      EMPTY_THREAD,
      ev(5, { type: 'tool_result', call_id: 'x', output: 'late', is_error: false }),
    );

    expect(state.items[0]).toMatchObject({ kind: 'tool', done: true, output: 'late' });
  });

  it('turns questions, permission decisions, finish and error into visible items', () => {
    const state = applyEvents(EMPTY_THREAD, [
      ev(1, { type: 'ask', interaction_id: 'i1', kind: 'question', prompt: 'UTC?' }),
      ev(2, { type: 'permission', call_id: 'c', tool: 'Bash', decision: 'deny' }),
      ev(3, { type: 'inbox_delivered', inbox_seq: 1, mode: 'steer' }),
      ev(4, { type: 'finish', summary: 'All done' }),
      ev(5, { type: 'error', family: 'crash', message: 'exited' }),
    ]);

    expect(state.items.map((i) => i.kind)).toEqual([
      'ask',
      'decision',
      'status',
      'status',
      'status',
    ]);

    expect(state.items[1]).toMatchObject({ decision: 'deny', tool: 'Bash' });
    expect(state.items[3]).toMatchObject({ tone: 'good', detail: 'All done' });
    expect(state.items[4]).toMatchObject({ tone: 'danger', family: 'crash' });
    expect(pendingAsk(state.items, 'i1')).toBe('UTC?');
    expect(pendingAsk(state.items, 'nope')).toBeUndefined();
  });

  it('drops usage, session and liveness noise but still advances past it', () => {
    const state = applyEvents(EMPTY_THREAD, [
      ev(1, {
        type: 'usage',
        usage: { in: 1, out: 1, cachedIn: 0, cacheWrite: 0 },
      }),
      ev(2, { type: 'session', session_ref: 's' }),
      ev(3, { type: 'hook_liveness', fingerprint: 'f' }),
    ]);

    expect(state.items).toHaveLength(0);
    expect(state.lastSeq).toBe(3);
  });

  it('ignores a replayed or older seq so a reconnect never duplicates a line', () => {
    const first = applyEvent(EMPTY_THREAD, ev(4, { type: 'text', text: 'once' }));
    const again = applyEvents(first, [
      ev(4, { type: 'text', text: 'once' }),
      ev(2, { type: 'text', text: 'older' }),
    ]);

    expect(again).toBe(first);
    expect(again.items).toHaveLength(1);
  });
});

describe('run status and interactions', () => {
  it('has words and a tone for every run status; only active ones are live', () => {
    for (const status of RunStatus.options) {
      expect(RUN_STATUS_LABEL[status]).toMatch(/\S/);
    }

    expect(runTone('error')).toBe('bad');
    expect(runTone('success')).toBe('good');
    expect(isRunLive('running')).toBe(true);
    expect(isRunLive('success')).toBe(false);
  });

  it('reads the question from the stream, then the payload, then a fallback', () => {
    expect(promptOf({ prompt: 'p' }, 'streamed')).toBe('streamed');
    expect(promptOf({ prompt: 'from payload' })).toBe('from payload');
    expect(promptOf('plain')).toBe('plain');
    expect(promptOf({ other: 1 })).toMatch(/waiting for your answer/);
    expect(promptOf(null, '  ')).toMatch(/waiting for your answer/);
  });

  it('offers yes and no only for confirmations', () => {
    expect(quickReplies('plan_confirm')).toHaveLength(2);
    expect(quickReplies('question')).toEqual([]);
  });
});

describe('time labels', () => {
  const now = Date.parse('2026-10-16T12:00:00.000Z');

  it('says how long ago in the biggest sensible unit', () => {
    expect(timeAgo('2026-10-16T11:59:40.000Z', now)).toBe('just now');
    expect(timeAgo('2026-10-16T11:56:00.000Z', now)).toBe('4 min ago');
    expect(timeAgo('2026-10-16T09:00:00.000Z', now)).toBe('3 h ago');
    expect(timeAgo('2026-10-14T12:00:00.000Z', now)).toBe('2 d ago');
    expect(timeAgo('2026-01-01T12:00:00.000Z', now)).toBe('2026-01-01');
    expect(timeAgo('nonsense', now)).toBe('unknown time');
  });

  it('formats a clock time and tolerates garbage', () => {
    expect(clockTime(ts)).toMatch(/\d\d:\d\d:\d\d/);
    expect(clockTime('nope')).toBe('');
  });
});
