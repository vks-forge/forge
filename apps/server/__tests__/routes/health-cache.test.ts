/**
 * `GET /health` database check: cached for one second.
 *
 * Why: the route is open to every program on the machine, and each uncached call opens a
 *   database transaction behind the single writer queue. A polling loop (or a hostile one)
 *   would queue behind and in front of the Director's own transactions. A one-second cache
 *   keeps the check meaningful (a broken database shows within a second) and makes calls cheap.
 *
 * Pins: calls inside the window cost one storage transaction; the next call after the window
 *   asks again; a failure is cached for the window too, then recovers.
 * Depends on: src/routes/health. IO: none (fake response and storage).
 */

import type { ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { HEALTH_CACHE_MS, healthRoute } from '#/routes/health.js';
import type { RouteDeps } from '#/types/routes.types.js';

function setup() {
  let now = 1_000;
  const state = { fail: false };
  const transaction = vi.fn(async () => {
    if (state.fail) {
      throw new Error('locked');
    }

    return [];
  });

  const route = healthRoute({
    storage: { transaction },
    now: () => now,
  } as unknown as RouteDeps);

  const call = async (): Promise<number> => {
    let status = 0;
    const res = {
      headersSent: false,
      writableEnded: false,
      writeHead: (s: number) => {
        status = s;
      },
      end: () => undefined,
    } as unknown as ServerResponse;

    await route.handle({ res } as never);

    return status;
  };

  return {
    call,
    transaction,
    state,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('GET /health cache', () => {
  it('asks the database once for calls inside the window', async () => {
    const t = setup();

    await t.call();
    t.advance(HEALTH_CACHE_MS - 1);
    await t.call();
    await t.call();

    expect(t.transaction).toHaveBeenCalledTimes(1);
  });

  it('asks again once the window has passed', async () => {
    const t = setup();

    await t.call();
    t.advance(HEALTH_CACHE_MS);
    await t.call();

    expect(t.transaction).toHaveBeenCalledTimes(2);
  });

  it('reports a failure, holds it for the window, then recovers', async () => {
    const t = setup();
    t.state.fail = true;

    expect(await t.call()).toBe(503);

    t.state.fail = false;
    expect(await t.call()).toBe(503);

    t.advance(HEALTH_CACHE_MS);
    expect(await t.call()).toBe(200);
  });
});
