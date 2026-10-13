/**
 * What the Worker is told about finishing, handed to the `dispatch_prompt` step.
 *
 * Why: a run is judged by gate G1 against the claims in its `finish` call, so a Worker that
 *   edits files but finishes without claiming them (or finishes without calling `finish`
 *   at all) fails verification and costs a rework run. The Director's prompt step must
 *   therefore always restate the contract, and on a rework say that the previous attempt
 *   was rejected by the gates, not by a person.
 *
 * Exports: workerContract().
 * Depends on: none. No IO.
 */

const FINISH_RULES = [
  'End the run by calling the `finish` tool; a run that ends without it cannot be verified.',
  'Give `finish` a typed claim for every file you edited ({"kind":"edited","path":...}) and for every file you added a test in; add {"kind":"ran_tests"} only if you ran the project tests, and {"kind":"read",...} for files you relied on.',
  'Gate G1 checks each claim against the tool-call receipts and the real git diff: a claim without evidence, or an edit without a claim, fails the gate.',
  'Do not push or open pull requests; the Director publishes the branch after your run.',
] as const;

/** The instruction block the dispatch prompt must carry, and a rework reminder when the run follows a failed gate. */
export function workerContract(rework: boolean): {
  readonly finish_rules: readonly string[];
  readonly rework_note?: string;
} {
  return rework
    ? {
        finish_rules: FINISH_RULES,
        rework_note:
          'The previous run was rejected by the verification gates, not by a person. Fix the findings, then call `finish` again with typed claims for every file you edited this time and before.',
      }
    : { finish_rules: FINISH_RULES };
}
