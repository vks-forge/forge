/**
 * Types for checking an agent definition against its role bounds.
 *
 * Why: the role rules are pure functions that run in the schema, in the server before a save
 *   and in tests over generated definitions. They read only the few fields a bound depends on,
 *   so they take a structural input instead of the zod type: the schema can then call them
 *   without the module importing the schema back.
 *
 * Exports: AgentRuleInput, AgentRuleIssue.
 * Depends on: nothing. Types only.
 */

/** The fields of an agent definition the role bounds read. */
export interface AgentRuleInput {
  readonly role: 'writer' | 'reviewer' | 'tester' | 'researcher';
  readonly tools: 'lane_default' | readonly string[];
  readonly write_scope: readonly string[];
  readonly runs_on: {
    readonly model: { readonly kind: string };
    readonly fallbacks: readonly {
      readonly harness: string;
      readonly model: { readonly kind: string; readonly id?: string };
    }[];
  };
}

/** One broken bound: where it is (a field path) and what is wrong, in plain words. */
export interface AgentRuleIssue {
  readonly path: string[];
  readonly message: string;
}
