/**
 * PipelineProblems: the problems and warnings that belong to the whole list rather than one row.
 *
 * Why: some faults are not about a stage ("there is no writer", "G1 is missing", "too many
 *   stages") and some warnings are advice, not refusals (a critic on the same model family as the
 *   writer sees the same blind spots, d-0073). Showing them together above the list, in words, the
 *   moment they exist, means the owner learns why Save is held before pressing it. Errors
 *   interrupt a screen reader; warnings wait their turn. While the server is still checking the
 *   latest edit, the notice says so, so a quiet list is never mistaken for a passed one.
 *
 * Exports: PipelineProblems.
 * Depends on: components/settings/form-field, domain/pipeline-copy, @forge/core (types).
 */

import type { PipelineProblem } from '@forge/core';
import { Notice } from '#/components/settings/form-field.js';
import { problemWords } from '#/domain/pipeline-copy.js';

export function PipelineProblems(props: {
  general: readonly PipelineProblem[];
  warnings: readonly string[];
  checking: boolean;
}) {
  return (
    <>
      {props.general.length > 0 ? (
        <Notice tone="error" title="This pipeline cannot be saved yet">
          <ul className="list-disc pl-4">
            {props.general.map((problem) => (
              <li key={`${problem.code}-${problem.message}`}>{problemWords(problem)}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {props.warnings.length > 0 ? (
        <Notice tone="warn" title="Worth a second look">
          <ul className="list-disc pl-4">
            {props.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      <p role="status" className="text-xs text-muted empty:hidden">
        {props.checking ? 'Checking this list with Forge…' : null}
      </p>
    </>
  );
}
