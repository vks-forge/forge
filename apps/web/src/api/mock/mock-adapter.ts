/**
 * The `mock` adapter: typed fixtures served with realistic delay, and on-demand empty or error.
 *
 * Why: a UI built against instant, always-successful data hides its loading skeletons, empty
 *   panels and error banners until a real server misbehaves. This adapter waits 150 to 400 ms
 *   per call (so a skeleton is actually seen and a layout shift would be), and a scenario
 *   switch makes it answer with nothing or fail, so those states are developed and tested
 *   rather than assumed. The delay honours the abort signal like a real request.
 *
 * Exports: createMockAdapter().
 * Depends on: api/api-error, api/mock/fixtures, types/api.types.
 */

import { ApiError } from '#/api/api-error.js';
import { projectFixtures } from '#/api/mock/fixtures.js';
import { createMemoryMock } from '#/api/mock/memory-mock.js';
import { createProjectSettingsMock } from '#/api/mock/project-settings-mock.js';
import { createSettingsMock } from '#/api/mock/settings-mock.js';
import type { ForgeApiAdapter, MockOptions } from '#/types/api.types.js';

const DEFAULT_LATENCY: readonly [number, number] = [150, 400];

function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);

    if (signal?.aborted) {
      abort();
    } else {
      signal?.addEventListener('abort', abort, { once: true });
    }
  });
}

export function createMockAdapter(options: MockOptions = {}): ForgeApiAdapter {
  const scenario = options.scenario ?? 'ok';
  const [min, max] = options.latencyMs ?? DEFAULT_LATENCY;
  const random = options.random ?? Math.random;
  const delay = (signal: AbortSignal | undefined): Promise<void> =>
    wait(min + random() * (max - min), signal);

  const archived = new Set<string>();
  const context = {
    scenario,
    delay: (signal?: AbortSignal) => delay(signal),
    archived,
  };

  return {
    ...createSettingsMock(delay, scenario),
    memory: createMemoryMock(context),
    projectSettings: createProjectSettingsMock(context),
    projects: {
      async list(request) {
        await delay(request?.signal);
        if (scenario === 'error') {
          throw new ApiError('network', 'Cannot reach the Forge server (simulated).');
        }

        return scenario === 'empty'
          ? []
          : projectFixtures.map((p) =>
              archived.has(p.slug) ? { ...p, status: 'archived' as const } : p,
            );
      },
    },
  };
}
