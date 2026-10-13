/**
 * Pins: argument validation refuses anything git could read as an option.
 *
 * Why: branch and base-ref names come from tickets and config; a value such as
 *   `--upload-pack=...` passed to git would run attacker-chosen commands. The check must
 *   refuse it before any process is spawned.
 *
 * Depends on: src/domain/ref-check.
 */

import { InvalidInputError } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { assertSafeRefArg } from '#/domain/ref-check.js';

describe('assertSafeRefArg', () => {
  it.each(['main', 'feat/FRG-1-a', 'a1b2c3', 'origin/main', 'HEAD~1'])(
    'accepts %s',
    (v) => {
      expect(() => assertSafeRefArg('ref', v)).not.toThrow();
    },
  );

  it.each(['', '-x', '--upload-pack=x', 'a\0b', 'a\nb'])('rejects %j', (v) => {
    expect(() => assertSafeRefArg('ref', v)).toThrow(InvalidInputError);
  });

  it('names the offending argument in the message', () => {
    expect(() => assertSafeRefArg('baseRef', '-x')).toThrow(/baseRef/);
  });
});
