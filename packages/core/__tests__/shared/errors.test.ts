/**
 * Tests for the ForgeError hierarchy.
 *
 * Why: retry/stall/kill read the family, so the mapping must not drift (code.md rule 7,
 *   execution-plane.md §8).
 *
 * Pins: each subclass carries its errorFamily, is an Error, has its class name, and
 *   preserves `cause` (code.md rule 7).
 * Depends on: src/shared/errors, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  AuthError,
  BudgetError,
  CrashError,
  ForgeError,
  PolicyDeniedError,
  RateLimitError,
  RefusalError,
  StallError,
  UnknownForgeError,
} from '#/shared/errors.js';

describe('ForgeError', () => {
  it.each([
    [new AuthError('x'), 'auth'],
    [new RateLimitError('x'), 'rate_limit'],
    [new BudgetError('x'), 'budget'],
    [new StallError('x'), 'stall'],
    [new RefusalError('x'), 'refusal'],
    [new CrashError('x'), 'crash'],
    [new PolicyDeniedError('x'), 'policy_denied'],
    [new UnknownForgeError('x'), 'unknown'],
  ])('%o carries its family', (e, family) => {
    expect(e).toBeInstanceOf(ForgeError);
    expect(e).toBeInstanceOf(Error);
    expect(e.errorFamily).toBe(family);
    expect(e.name).toBe(e.constructor.name);
  });

  it('keeps the cause', () => {
    const cause = new Error('inner');
    expect(new CrashError('outer', { cause }).cause).toBe(cause);
  });
});
