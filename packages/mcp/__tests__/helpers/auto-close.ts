/**
 * Per-test cleanup for MCP client connections.
 *
 * Why: every tool test opens an in-memory client/server pair through the real protocol.
 * A pair left open keeps its transport and storage alive into the next test, so a
 * failure in one test could surface as noise in another. One helper closes whatever the
 * test opened, after every test, so suites cannot forget.
 *
 * Exports: useAutoClose().
 * Depends on: vitest. No IO of its own.
 */

import { afterEach } from 'vitest';

/** Registers an `afterEach` that closes the last connection passed to `set`. */
export function useAutoClose(): {
  set: (close: () => Promise<void>) => void;
  run: () => Promise<void>;
} {
  let current: (() => Promise<void>) | undefined;
  const run = async (): Promise<void> => {
    await current?.();
    current = undefined;
  };

  afterEach(run);

  return {
    set: (close) => {
      current = close;
    },
    run,
  };
}
