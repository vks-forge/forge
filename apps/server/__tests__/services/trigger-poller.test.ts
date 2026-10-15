/**
 * The trigger polling loop.
 *
 * Why: polled sources feed the same intake door as pushed ones, so the loop must pass each
 *   adapter its own cursor (or the next poll refetches everything), must not move the cursor
 *   when a poll fails (or events in the outage window are lost), must drop an event that
 *   claims another source (or a source could impersonate another), and must cost nothing
 *   when no source polls.
 *
 * Pins: events reach ingest, cursor advances to the newest received_at, a failing poll is
 *   logged and retried from the same cursor, invalid or foreign events are dropped, no timer
 *   without polled adapters, the interval fires, stop waits and silences.
 * Depends on: src/services/trigger-poller, src/services/trigger-registry, helpers. Timers only.
 */

import { createChatTrigger } from '@forge/triggers';
import { describe, expect, it, vi } from 'vitest';
import { createTriggerPoller } from '#/services/trigger-poller.js';
import { createTriggerRegistry } from '#/services/trigger-registry.js';
import { fakePolledTrigger, issueEvent } from '#tests/helpers/fake-polled-trigger.js';

function rig(intervalMs = 60_000) {
  const fake = fakePolledTrigger();
  const ingest = vi.fn(async () => ({ status: 'ticket_created' }));
  const log = vi.fn();
  const poller = createTriggerPoller({
    registry: createTriggerRegistry([createChatTrigger(), fake]),
    ingest,
    intervalMs,
    log,
  });

  return { fake, ingest, log, poller };
}

describe('createTriggerPoller', () => {
  it('ingests what a poll returns and advances the cursor to the newest event', async () => {
    const { fake, ingest, poller } = rig();
    fake.pending = [
      issueEvent('a', '2026-10-15T01:00:00.000Z'),
      issueEvent('b', '2026-10-15T02:00:00.000Z'),
    ];

    await poller.pollOnce();
    await poller.pollOnce();

    expect(ingest).toHaveBeenCalledTimes(3);
    expect(fake.calls).toEqual([null, '2026-10-15T02:00:00.000Z']);
  });

  it('keeps the cursor and logs when a poll fails, then retries from the same point', async () => {
    const { fake, ingest, log, poller } = rig();
    fake.pending = [issueEvent('a', '2026-10-15T01:00:00.000Z')];
    await poller.pollOnce();

    fake.failNext = new Error('github down');
    await poller.pollOnce();
    await poller.pollOnce();

    expect(log).toHaveBeenCalledWith(
      'error',
      'trigger poll failed',
      expect.objectContaining({ trigger: 'fake-polled' }),
    );

    expect(fake.calls).toEqual([
      null,
      '2026-10-15T01:00:00.000Z',
      '2026-10-15T01:00:00.000Z',
    ]);

    expect(ingest).toHaveBeenCalledTimes(2);
  });

  it('drops an event that is malformed or claims another source', async () => {
    const { fake, ingest, log, poller } = rig();
    fake.pending = [
      { ...issueEvent('x', '2026-10-15T01:00:00.000Z'), source: 'chat' },
      { ...issueEvent('y', '2026-10-15T01:00:00.000Z'), dedupe_key: '' },
      issueEvent('ok', '2026-10-15T01:00:00.000Z'),
    ];

    await poller.pollOnce();

    expect(ingest).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('dropped'),
      expect.anything(),
    );
  });

  it('creates no timer when no adapter polls', async () => {
    const spy = vi.spyOn(globalThis, 'setInterval');
    const poller = createTriggerPoller({
      registry: createTriggerRegistry([createChatTrigger()]),
      ingest: vi.fn(),
      intervalMs: 5,
      log: vi.fn(),
    });

    poller.start();
    await poller.stop();

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('polls on its interval once started and stops when asked', async () => {
    const { fake, poller } = rig(5);

    poller.start();
    await vi.waitFor(() => expect(fake.calls.length).toBeGreaterThanOrEqual(2));
    await poller.stop();
    const seen = fake.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(fake.calls.length).toBe(seen);
  });
});
