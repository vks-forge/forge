/**
 * Pins: the adapter's turn-limit rejection ("Reached maximum number of turns (3)") is read as `max_turns`,
 * and look-alikes ("maximum number of tokens", `turn_timeout`) are not.
 *
 * Why: the eval ticket that hit its turn limit was classified `unknown`, so the engine retried it once (a wasted
 *   run that hit the limit again) and parked it as "failed 2 times". A turn limit is a setting the owner raises;
 *   reading it as a crash hides the cause, and reading a token or timeout error as a turn limit would send the
 *   owner to the wrong setting.
 * Depends on: src/domain/failure-classify.
 */

import { describe, expect, it } from 'vitest';
import { classifyRejection } from '#/domain/failure-classify.js';

const kind = (message: string): string =>
  classifyRejection({ code: -32603, message }, null, () => '2026-01-01T00:00:00.000Z')
    .kind;

describe('turn-limit classification', () => {
  it.each([
    'Reached maximum number of turns (3)',
    'Internal error: Reached maximum number of turns (3)',
    'error_max_turns',
    'max-turns exceeded',
    'The turn limit was reached',
  ])('reads %j as max_turns', (message) => {
    expect(kind(message)).toBe('max_turns');
  });

  it.each(['Reached maximum number of tokens', 'turn_timeout', 'weird'])(
    'does not read %j as a turn limit',
    (message) => {
      expect(kind(message)).toBe('unknown');
    },
  );

  it('keeps a budget stop a budget stop', () => {
    expect(kind('Reached maximum budget ($0.05)')).toBe('budget');
  });
});
