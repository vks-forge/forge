/**
 * Shape of one recorded storage write, passed from the decorator to the trace rules.
 *
 * Why: the storage decorator records each write inside the transaction (arguments, the row as
 *   it was before when the entry needs it, and what the call returned) and turns the list into
 *   trace entries only after the commit, so a rolled-back transaction leaves no trace of
 *   changes that never happened (d-0163).
 *
 * Exports: WriteCall.
 * Depends on: nothing. Types only.
 */

export interface WriteCall {
  /** The repository property of the transaction (`tickets`, `cardEvents`, ...). */
  readonly repo: string;
  readonly method: string;
  readonly args: readonly unknown[];
  readonly result: unknown;
  /** The ticket or interaction row read just before the write, when the entry wants it. */
  readonly before?: unknown;
}
