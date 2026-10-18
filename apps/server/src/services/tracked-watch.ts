/**
 * The recording wrapper of tracked storage: a repository whose listed writes note what they touched.
 *
 * Why: the control room must update within a second of any write (d-0132), and asking each writer to remember to
 *   notify would miss one sooner or later. Wrapping a repository so that each listed method records, after it
 *   succeeds, what it touched means a write cannot be forgotten; the recorded touches are resolved to project query
 *   keys at the end of the transaction, so a rolled-back write announces nothing.
 *
 * Exports: watch(), first().
 * Depends on: types/tracked-storage. No IO.
 */

import type { Recorder, Touch } from '#/types/tracked-storage.types.js';

/** Wraps `repo` so that each listed method records what it touched after it succeeds. */
export function watch<R extends object>(
  repo: R,
  touches: Touch[],
  writes: Readonly<Record<string, Recorder>>,
): R {
  return new Proxy(repo, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      const record = typeof prop === 'string' ? writes[prop] : undefined;
      if (typeof value !== 'function' || !record) {
        return value;
      }

      return async (...args: unknown[]) => {
        const out = await (value as (...a: unknown[]) => Promise<unknown>).apply(
          target,
          args,
        );

        touches.push(...[record(args)].flat());

        return out;
      };
    },
  });
}

export const first = (args: readonly unknown[]): string => String(args[0]);
