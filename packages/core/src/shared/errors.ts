/**
 * Typed error hierarchy — ForgeError and one subclass per error family.
 *
 * Why: retry, stall and kill decisions read the `errorFamily`, never the message
 *   (code.md rule 7, execution-plane.md §8 run lifecycle retry policy), so every
 *   failure carries a family from one core enum.
 *
 * Exports: ForgeError, AuthError, RateLimitError, BudgetError,
 *   StallError, RefusalError, CrashError, PolicyDeniedError, UnknownForgeError,
 *   InvalidInputError.
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

/** Bad caller input to a pure constructor (e.g. makeTicketId); not a runtime/harness fault. */
export class InvalidInputError extends UnknownForgeError {}
