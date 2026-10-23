/**
 * A Director step the test holds open: the model call starts and waits until the test lets it go.
 *
 * Why: Director steps now run beside the tick, so the behaviours that matter (a Worker starts
 *   while a planning step is still thinking, three cards think at once and the fourth waits) can
 *   only be observed while a call is pending. The scripted model already runs a hook while a call
 *   is in flight; this turns that hook into one deferred promise per call that the test resolves
 *   by hand.
 *
 * Exports: Hang, hangStep().
 * Depends on: helpers/rig (Rig). No IO.
 */

import type { StepName } from '@forge/core';
import type { Rig } from '#tests/helpers/rig.js';

export interface Hang {
  /** Calls of the step that began and have not been released yet, plus those released. */
  readonly started: number;
  /** Lets the call at `index` (default: the oldest unreleased one) answer. */
  release(index?: number): void;
  /** Lets every call, now and later, answer at once. */
  releaseAll(): void;
}

/** Makes every call of `name` wait for the test; returns the handle that releases them. */
export function hangStep(rig: Rig, name: StepName): Hang {
  const gates: { open: () => void; opened: boolean }[] = [];
  let all = false;

  rig.llm.during(
    name,
    () =>
      new Promise<void>((resolve) => {
        const gate = { open: resolve, opened: false };
        gates.push(gate);
        if (all) {
          gate.opened = true;
          resolve();
        }
      }),
  );

  return {
    get started() {
      return gates.length;
    },
    release(index) {
      const gate = index === undefined ? gates.find((g) => !g.opened) : gates[index];
      if (gate) {
        gate.opened = true;
        gate.open();
      }
    },
    releaseAll() {
      all = true;
      for (const gate of gates) {
        gate.opened = true;
        gate.open();
      }
    },
  };
}
