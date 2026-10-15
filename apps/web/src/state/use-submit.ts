/**
 * `useSubmit()`: runs one write and tracks idle, pending, success and error for its button.
 *
 * Why: every settings form needs the same loop: block a second click while the request is in
 *   flight, show the server's reason when it refuses, show success once. The write is held in
 *   component state, not in a shared query cache, on purpose: a pasted API key or GitHub App
 *   private key must not linger in a cache that outlives the form. `run()` resolves to the
 *   result, or `undefined` after recording the error, so callers never need a try/catch.
 *
 * Exports: useSubmit(), SubmitState.
 * Depends on: react, types/state.types.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SubmitState } from '#/types/state.types.js';

export function useSubmit<Args extends unknown[], Result>(
  action: (...args: Args) => Promise<Result>,
): SubmitState<Args, Result> {
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [error, setError] = useState<unknown>(undefined);
  // The latest action without re-creating `run` on every render.
  const latest = useRef(action);
  useEffect(() => {
    latest.current = action;
  });

  const run = useCallback(async (...args: Args): Promise<Result | undefined> => {
    setStatus('pending');
    setError(undefined);
    try {
      const result = await latest.current(...args);
      setStatus('success');

      return result;
    } catch (caught) {
      setError(caught);
      setStatus('error');

      return undefined;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(undefined);
  }, []);

  return { run, reset, status, error, pending: status === 'pending' };
}
