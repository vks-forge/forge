/**
 * Types for budget check results.
 *
 * Why: when a call is stopped for cost or volume, the Worker's run, the approval flow and
 *   the Ticket screen need to know which counter tripped (this tool or the whole run) and
 *   whether it was a hard stop or a request for approval.
 *
 * Exports: BudgetVerdict.
 * Depends on: No IO (types only).
 */

export type BudgetVerdict =
  | { readonly verdict: 'ok' }
  | {
      readonly verdict: 'ask' | 'deny';
      readonly scope: 'tool' | 'run';
      readonly kind: 'calls' | 'usd' | 'invalid';
    };
