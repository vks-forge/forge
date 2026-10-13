/**
 * Pins: every row of the CLI engine's result table.
 *
 * Why: the Director decides retry, rate-limit backoff, escalation or pause from the
 * normalised result family. A budget stop is a normal-looking exit 0 with no result text
 * (probe 1), so a wrong row here means a Worker that ran out of budget is reported as
 * success, or a crash is retried forever.
 *
 * Depends on: helpers/claude-rigs (runs helpers/fake-claude.mjs under node), helpers/cli-run,
 *   helpers/wait-for.
 */

import { describe, expect, it } from 'vitest';
import { line, makeCliRig, STREAM } from '#tests/helpers/claude-rigs.js';
import { waitFor } from '#tests/helpers/wait-for.js';
import { run } from '#tests/helpers/cli-run.js';

describe('CLI engine: result table', { timeout: 30_000 }, () => {
  it('budget: subtype error_max_budget_usd with exit 0 and no result text', async () => {
    const { result } = await run([
      STREAM.result({
        subtype: 'error_max_budget_usd',
        is_error: true,
        result: undefined,
      }),
    ]);

    expect(result).toMatchObject({ status: 'error', errorFamily: 'budget' });
  });

  it('max_turns: subtype error_max_turns drops the session', async () => {
    const { result } = await run([
      STREAM.result({ subtype: 'error_max_turns', is_error: true }),
    ]);

    expect(result).toMatchObject({ status: 'max_turns', session: null });
  });

  it('refusal: stop_reason refusal is refused/refusal', async () => {
    const { result } = await run([STREAM.result({ stop_reason: 'refusal' })]);
    expect(result).toMatchObject({ status: 'refused', errorFamily: 'refusal' });
  });

  it('rate limit: a 429 result uses the rate_limit_event reset time', async () => {
    const reset = Math.floor(Date.UTC(2026, 9, 13, 20, 0, 0) / 1000);
    const { result } = await run([
      line({
        type: 'rate_limit_event',
        rate_limit_info: { status: 'rejected', resetsAt: reset },
      }),
      STREAM.result({
        is_error: true,
        result: 'API Error: 429 rate limit',
        api_error_status: 429,
      }),
    ]);

    expect(result).toMatchObject({
      status: 'error',
      errorFamily: 'rate_limit',
      retryNotBefore: new Date(reset * 1000).toISOString(),
    });
  });

  it('rate limit: overloaded text without a reset backs off by the configured delay', async () => {
    const rig = makeCliRig({ rateLimitBackoffMs: 90_000 });
    rig.fixture([STREAM.result({ is_error: true, result: 'API Error: overloaded' })]);
    const r = await rig.driver.result(await rig.driver.start(rig.request()));
    expect(r.errorFamily).toBe('rate_limit');
    expect(r.retryNotBefore).toBe(new Date(rig.clock.now() + 90_000).toISOString());
  });

  it('auth: login error text is error/auth', async () => {
    const { result } = await run([
      STREAM.result({ is_error: true, result: 'Not logged in · Please run /login' }),
    ]);

    expect(result).toMatchObject({ status: 'error', errorFamily: 'auth' });
  });

  it('stall: no output for stallMs kills the run as timeout/stall', async () => {
    const rig = makeCliRig();
    rig.scriptHang();
    const h = await rig.driver.start(rig.request());
    await waitFor(() => rig.clock.pending() > 0, 'stall timer');
    await rig.clock.advance(60_000);
    expect(await rig.driver.result(h)).toMatchObject({
      status: 'timeout',
      errorFamily: 'stall',
    });
  });

  it('paused: ask_director as the last act pauses the run on its interaction', async () => {
    const { result } = await run([
      STREAM.init,
      STREAM.toolUse('q1', 'mcp__forge__ask_director', { question: 'which db?' }),
      STREAM.toolResult(
        'q1',
        JSON.stringify({ interaction_id: 'int-3', status: 'pending' }),
      ),
      STREAM.result(),
    ]);

    expect(result).toMatchObject({
      status: 'paused',
      pauseReason: 'interaction',
      interactionId: 'int-3',
    });
  });

  it('crash: a non-zero exit without a result line is error/crash with stderr in the event', async () => {
    const { result, events } = await run([STREAM.init], { exit: 1, stderr: 'boom\n' });
    expect(result).toMatchObject({ status: 'error', errorFamily: 'crash' });
    const err = events.find((e) => e.type === 'error');
    expect(err && 'message' in err ? err.message : '').toContain('boom');
  });

  it('crash: exit 0 without a result line is still a crash', async () => {
    const { result } = await run([STREAM.init, STREAM.text]);
    expect(result).toMatchObject({ status: 'error', errorFamily: 'crash' });
  });

  it('kills a process that printed its result but did not exit, after the grace period', async () => {
    const rig = makeCliRig({ cancelGraceMs: 2_000 });
    rig.fixture([STREAM.init, STREAM.result()], { hang: true });
    const h = await rig.driver.start(rig.request());
    for await (const e of rig.driver.events(h)) {
      if (e.type === 'usage') {
        break;
      }
    }

    await rig.clock.advance(2_000);
    expect((await rig.driver.result(h)).status).toBe('success');
    expect(rig.groupSignals).toHaveLength(1);
  });
});
