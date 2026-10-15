/**
 * Tests for the run status transition table.
 *
 * Why: a server restart must not turn a healthy Worker run into a failure, so a run has an
 *   `interrupted` status that is neither active nor ended: its session and receipts are the
 *   evidence a resume continues from. If the table let an interrupted run jump to `success`,
 *   or let an ended run come back, a resume could rewrite a finished run's history or a run
 *   could be resumed twice.
 *
 * Pins: which statuses can become `interrupted`, what an interrupted run may become, that
 *   nothing leaves a terminal status, and that the table covers every RunStatus.
 * Depends on: src/domain/run-lifecycle, src/schemas/run, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  RUN_TRANSITIONS,
  assertRunTransition,
  canTransitionRun,
} from '#/domain/run-lifecycle.js';
import { RunStatus } from '#/schemas/run.js';
import { InvalidInputError } from '#/shared/errors.js';

const status = fc.constantFrom(...RunStatus.options);
const TERMINAL: readonly RunStatus[] = [
  'settled',
  'success',
  'refused',
  'max_turns',
  'timeout',
  'error',
  'cancelled',
];

describe('canTransitionRun', () => {
  it.each(['starting', 'running', 'settling'] as const)(
    '%s can be interrupted by a shutdown',
    (from) => {
      expect(canTransitionRun(from, 'interrupted')).toBe(true);
    },
  );

  it.each(['running', 'settled'] as const)(
    'an interrupted run can become %s (resume or give up)',
    (to) => {
      expect(canTransitionRun('interrupted', to)).toBe(true);
    },
  );

  it.each(['success', 'error', 'cancelled', 'settling', 'interrupted'] as const)(
    'an interrupted run cannot jump to %s',
    (to) => {
      expect(canTransitionRun('interrupted', to)).toBe(false);
    },
  );

  it('an ended run is never interrupted', () => {
    for (const from of ['settled', 'success', 'error', 'cancelled'] as const) {
      expect(canTransitionRun(from, 'interrupted')).toBe(false);
    }
  });

  it('the table has a row for every status', () => {
    expect(Object.keys(RUN_TRANSITIONS).sort()).toEqual([...RunStatus.options].sort());
  });

  it('property: no status leaves a terminal one, and only live ones reach interrupted', () => {
    fc.assert(
      fc.property(status, status, (from, to) => {
        if (TERMINAL.includes(from)) {
          expect(canTransitionRun(from, to)).toBe(false);
        }

        if (to === 'interrupted' && canTransitionRun(from, to)) {
          expect(['starting', 'running', 'settling']).toContain(from);
        }
      }),
    );
  });

  it('property: from interrupted a walk over allowed moves continues only to running or settled', () => {
    fc.assert(
      fc.property(fc.array(status, { maxLength: 12 }), (steps) => {
        let at: RunStatus = 'starting';
        for (const next of steps) {
          if (!canTransitionRun(at, next)) {
            continue;
          }

          if (at === 'interrupted') {
            expect(['running', 'settled']).toContain(next);
          }

          at = next;
        }
      }),
    );
  });
});

describe('assertRunTransition', () => {
  it('throws InvalidInputError naming both statuses for a refused move', () => {
    expect(() => assertRunTransition('r1', 'interrupted', 'success')).toThrow(
      InvalidInputError,
    );

    expect(() => assertRunTransition('r1', 'interrupted', 'success')).toThrow(
      /interrupted to success/,
    );
  });

  it('accepts an allowed move and a no-op', () => {
    expect(() => assertRunTransition('r1', 'running', 'interrupted')).not.toThrow();
    expect(() => assertRunTransition('r1', 'running', 'running')).not.toThrow();
  });
});
