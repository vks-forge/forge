/**
 * Tests for the Director job tracker.
 *
 * Why: every Director step that runs beside the tick relies on the same few guarantees: starting a
 *   job never waits for it, a key has one job so a card or ticket has one writer, the tick is asked
 *   for when a job ends, the step limit counts only jobs executing, and what a job reported (even
 *   an unexpected throw) reaches the next tick instead of vanishing with the tick that started it.
 *
 * Pins: start returns before the body ends; a second start on a key (running or finished) is
 *   refused; the end of a job requests a tick; slots are the limit minus running jobs; collect
 *   merges the report, frees the key and leaves running jobs alone; a throwing body becomes a
 *   report error and an `ok: false` outcome; jobCtx reads the clock at start and has its own report;
 *   idle waits for running jobs; a brief holds no Director slot; the write a ticket step returns is run
 *   by the collecting tick with that tick's context, a failing write is reported and does not stop the
 *   others, and a step that threw has nothing to apply.
 * Depends on: src/tick/director-jobs, src/tick/tick-report, helpers/fakes, vitest.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  cardKey,
  collectDirectorJobs,
  directorIdle,
  directorSlots,
  jobCtx,
  startDirectorJob,
  startTicketStep,
  ticketKey,
} from '#/tick/director-jobs.js';
import { emptyReport } from '#/tick/tick-report.js';
import type { EngineCtx, EngineState } from '#/types/engine-state.types.js';
import { createFakeClock } from '#tests/helpers/fakes.js';

function makeCtx(limit = 2) {
  const clock = createFakeClock();
  const onTickRequested = vi.fn();
  const state = {
    directorJobs: new Map(),
    running: null,
    requested: false,
    notified: false,
  } as unknown as EngineState;

  const ctx = {
    deps: { clock, onTickRequested, log: vi.fn() },
    state,
    report: emptyReport(new Date(clock.now()).toISOString(), false),
    config: { forge: { director: { max_concurrent_steps: limit } } },
    now: clock.now(),
    nowIso: new Date(clock.now()).toISOString(),
  } as unknown as EngineCtx;

  return { ctx, state, clock, onTickRequested };
}

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));

  return { promise, resolve };
};

describe('startDirectorJob', () => {
  it('returns before the body ends and keeps one job per key', async () => {
    const { ctx } = makeCtx();
    const gate = deferred();
    const spec = {
      key: cardKey('C1'),
      kind: 'card_turn' as const,
      subject: 'C1',
      run: () => gate.promise,
    };

    const job = startDirectorJob(ctx, spec);

    expect(job?.outcome).toBeUndefined();
    expect(startDirectorJob(ctx, spec)).toBeNull();

    gate.resolve();
    await job?.done;

    expect(job?.outcome).toEqual({ ok: true });
    expect(startDirectorJob(ctx, spec)).toBeNull();
  });

  it('asks for a tick when a job ends', async () => {
    const { ctx, onTickRequested } = makeCtx();

    const job = startDirectorJob(ctx, {
      key: ticketKey('FG-1'),
      kind: 'ticket_step',
      subject: 'FG-1',
      run: async () => undefined,
    });

    await job?.done;

    expect(onTickRequested).toHaveBeenCalledTimes(1);
  });

  it('counts only executing jobs against the limit', async () => {
    const { ctx } = makeCtx(2);
    const gate = deferred();
    const start = (id: string, wait: Promise<void>) =>
      startDirectorJob(ctx, {
        key: cardKey(id),
        kind: 'card_turn',
        subject: id,
        run: () => wait,
      });

    start('A', gate.promise);
    const quick = start('B', Promise.resolve());
    await quick?.done;

    expect(directorSlots(ctx)).toBe(1);

    gate.resolve();
    await directorIdle(ctx.state);

    expect(directorSlots(ctx)).toBe(2);
  });

  it('gives a brief no Director slot', async () => {
    const { ctx } = makeCtx(1);
    const gate = deferred();

    startDirectorJob(ctx, {
      key: ticketKey('FG-1'),
      kind: 'brief',
      subject: 'FG-1',
      run: () => gate.promise,
    });

    expect(directorSlots(ctx)).toBe(1);
    expect(startTicketStep(ctx, 'FG-2', async () => undefined)).toBe(true);
    expect(directorSlots(ctx)).toBe(0);
    expect(startTicketStep(ctx, 'FG-3', async () => undefined)).toBe(false);

    gate.resolve();
    await directorIdle(ctx.state);
  });

  it('turns a throwing body into an error for the next tick report', async () => {
    const { ctx } = makeCtx();

    const job = startDirectorJob(ctx, {
      key: cardKey('C1'),
      kind: 'card_turn',
      subject: 'C1',
      run: () => Promise.reject(new Error('boom')),
    });

    await job?.done;

    expect(job?.outcome).toMatchObject({ ok: false });
    expect(job?.report.errors).toEqual([{ where: 'card:C1', message: 'boom' }]);
    expect(ctx.report.errors).toEqual([]);
  });
});

describe('collectDirectorJobs', () => {
  it('merges finished reports, frees their keys and leaves running jobs alone', async () => {
    const { ctx, state } = makeCtx(3);
    const gate = deferred();

    const done = startDirectorJob(ctx, {
      key: cardKey('A'),
      kind: 'card_turn',
      subject: 'A',
      run: async (job) => {
        job.report.rejectedSteps.push({
          step: 'card_chat',
          ticketId: 'A',
        } as never);
      },
    });

    const failed = startDirectorJob(ctx, {
      key: cardKey('B'),
      kind: 'card_turn',
      subject: 'B',
      run: () => Promise.reject(new Error('boom')),
    });

    startDirectorJob(ctx, {
      key: cardKey('C'),
      kind: 'card_turn',
      subject: 'C',
      run: () => gate.promise,
    });

    await done?.done;
    await failed?.done;

    await collectDirectorJobs(ctx);

    expect(ctx.report.rejectedSteps).toEqual([{ step: 'card_chat', ticketId: 'A' }]);
    expect(ctx.report.errors).toEqual([{ where: 'card:B', message: 'boom' }]);
    expect([...state.directorJobs.keys()]).toEqual(['card:C']);

    gate.resolve();
    await directorIdle(state);
  });
});

describe('ticket step apply', () => {
  it('runs the returned write in the collecting tick, and reports one that fails', async () => {
    const { ctx, state } = makeCtx(4);
    const seen: string[] = [];
    const step = (id: string, apply: (c: EngineCtx) => Promise<void>) =>
      startTicketStep(ctx, id, async () => apply);

    step('FG-1', async (c) => void seen.push(`FG-1 ${c === ctx}`));
    step('FG-2', async () => Promise.reject(new Error('apply failed')));
    step('FG-3', async (c) => void seen.push(`FG-3 ${c === ctx}`));
    startTicketStep(ctx, 'FG-4', () => Promise.reject(new Error('compute failed')));
    await directorIdle(state);

    expect(seen).toEqual([]);

    await collectDirectorJobs(ctx);

    expect(seen).toEqual(['FG-1 true', 'FG-3 true']);
    expect(ctx.report.errors).toEqual([
      { where: 'ticket:FG-2 apply', message: 'apply failed' },
      { where: 'ticket:FG-4', message: 'compute failed' },
    ]);

    expect(state.directorJobs.size).toBe(0);
  });
});

describe('jobCtx', () => {
  it('reads the clock when the job starts and gives the job its own report', () => {
    const { ctx, clock } = makeCtx();
    clock.advance(5 * 60 * 1000);

    const inner = jobCtx(ctx);

    expect(inner.now).toBe(clock.now());
    expect(inner.nowIso).toBe(new Date(clock.now()).toISOString());
    expect(inner.nowIso).not.toBe(ctx.nowIso);
    expect(inner.report).not.toBe(ctx.report);
    expect(inner.report.errors).toEqual([]);
  });
});
