/**
 * Typed error hierarchy — ForgeError and one subclass per error family.
 *
 * Why: the Director's retry, stall and kill logic must branch on a closed set of failure
 *   classes, not on message strings that change between harnesses and versions. Every
 *   thrown failure is a ForgeError carrying its errorFamily, so a driver crash, a rate
 *   limit and a policy denial are handled differently by construction, and an
 *   unclassified failure lands in `unknown`, which policy treats as fail-closed.
 *   InvalidInputError (family `invalid_input`) marks caller bugs, in pure constructors
 *   and at the storage boundary, so they are not mistaken for harness faults and retried (execution-plane.md §8).
 *
 * Exports: ForgeError, AuthError, RateLimitError, BudgetError,
 *   StallError, RefusalError, CrashError, PolicyDeniedError, UnknownForgeError,
 *   InvalidInputError, HeadMovedError.
 * Depends on: schemas/errors, types/errors. No IO.
 */

import type { ErrorFamily } from '#/schemas/errors.js';
import type { ForgeErrorOptions } from '#/types/errors.types.js';

/** Base class for all thrown Forge errors; carries its {@link ErrorFamily}. */
export class ForgeError extends Error {
  readonly errorFamily: ErrorFamily;

  constructor(errorFamily: ErrorFamily, message: string, options?: ForgeErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.errorFamily = errorFamily;
  }
}

/** Credentials missing, expired or rejected. */
export class AuthError extends ForgeError {
  constructor(message: string, options?: ForgeErrorOptions) {
    super('auth', message, options);
  }
}
/** Provider rate or usage limit hit; retry later. */
export class RateLimitError extends ForgeError {
  constructor(message: string, options?: ForgeErrorOptions) {
    super('rate_limit', message, options);
  }
}
/** A run or ticket budget was exhausted. */
export class BudgetError extends ForgeError {
  constructor(message: string, options?: ForgeErrorOptions) {
    super('budget', message, options);
  }
}
/** A run made no progress within its stall window. */
export class StallError extends ForgeError {
  constructor(message: string, options?: ForgeErrorOptions) {
    super('stall', message, options);
  }
}
/** The model refused the task. */
export class RefusalError extends ForgeError {
  constructor(message: string, options?: ForgeErrorOptions) {
    super('refusal', message, options);
  }
}
/** The harness process died or misbehaved. */
export class CrashError extends ForgeError {
  constructor(message: string, options?: ForgeErrorOptions) {
    super('crash', message, options);
  }
}
/** The admission policy denied an action. */
export class PolicyDeniedError extends ForgeError {
  constructor(message: string, options?: ForgeErrorOptions) {
    super('policy_denied', message, options);
  }
}
/** Unclassified failure; policy treats it as fail-closed. */
export class UnknownForgeError extends ForgeError {
  constructor(message: string, options?: ForgeErrorOptions) {
    super('unknown', message, options);
  }
}

/** Bad caller input (a pure constructor, a rejected patch, a constraint violation); a caller bug, not a runtime/harness fault, so it is never retried as-is. */
export class InvalidInputError extends ForgeError {
  constructor(message: string, options?: ForgeErrorOptions) {
    super('invalid_input', message, options);
  }
}

/**
 * A PR's head is no longer the commit the gates judged (a push or force-push landed after
 * the verdicts). Not a fault to retry or park: the engine answers it by gating the new head.
 */
export class HeadMovedError extends ForgeError {
  constructor(message: string, options?: ForgeErrorOptions) {
    super('invalid_input', message, options);
  }
}
