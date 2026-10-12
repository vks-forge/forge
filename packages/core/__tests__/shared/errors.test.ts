/**
 * Tests for the ForgeError hierarchy.
 *
 * Why: retry, stall and kill read the family. If a subclass carried the wrong family (a
 *   rate limit treated as a crash, a refusal retried) the Director would retry what
 *   should escalate or give up on what should back off. Keeping `cause` means the
 *   original harness failure survives for debugging (execution-plane.md §8).
 *
 * Pins: each subclass carries its errorFamily, is an Error, has its class name, and
 *   preserves `cause`.
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
