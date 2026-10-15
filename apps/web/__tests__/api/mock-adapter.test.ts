/**
 * Pins: the mock adapter waits like a real server (150 to 400 ms by default), can answer empty
 * or fail on demand, stops waiting when the request is aborted, and every fixture row matches
 * the real project schema.
 *
 * Why: loading skeletons, empty panels and error banners only get designed if the stand-in
 *   server can be slow, empty or broken; and a fixture that drifts from the schema would let a
 *   screen pass tests against data the real server can never send.
 * Depends on: src/api/mock/*, src/schemas/projects. Fake timers.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { projectFixtures } from '#/api/mock/fixtures.js';
import { createMockAdapter } from '#/api/mock/mock-adapter.js';
import { ProjectView } from '#/schemas/projects.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('mock adapter', () => {
  it('serves fixtures that are clearly samples and match the real schema', () => {
    expect(projectFixtures.length).toBeGreaterThan(1);
    for (const row of projectFixtures) {
      expect(ProjectView.safeParse(row).success).toBe(true);
      expect(row.slug.startsWith('sample-')).toBe(true);
    }
  });

  it('waits within the default latency range before answering', async () => {
    vi.useFakeTimers();
    const adapter = createMockAdapter({ random: () => 0.5 });
    let done = false;

    const call = adapter.projects!.list().then(() => {
      done = true;
    });

    await vi.advanceTimersByTimeAsync(274);
    expect(done).toBe(false);

    await vi.advanceTimersByTimeAsync(2);
    await call;
    expect(done).toBe(true);
  });

  it('answers with nothing in the empty scenario', async () => {
    const adapter = createMockAdapter({ scenario: 'empty', latencyMs: [0, 0] });

    expect(await adapter.projects!.list()).toEqual([]);
  });

  it('fails like a dead server in the error scenario', async () => {
    const adapter = createMockAdapter({ scenario: 'error', latencyMs: [0, 0] });

    await expect(adapter.projects!.list()).rejects.toMatchObject({ kind: 'network' });
  });

  it('stops waiting when the request is aborted', async () => {
    const adapter = createMockAdapter({ latencyMs: [10_000, 10_000] });
    const controller = new AbortController();

    const call = adapter.projects!.list({ signal: controller.signal });
    controller.abort();

    await expect(call).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('refuses at once when the signal is already aborted', async () => {
    const adapter = createMockAdapter({ latencyMs: [10_000, 10_000] });

    await expect(
      adapter.projects!.list({ signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
