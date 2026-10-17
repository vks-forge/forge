/**
 * Pipeline copy: the plain words of the pipeline editor: a sentence for every problem code, the
 * kind and lane labels, and the explanation of a refused write.
 *
 * Why: core refuses an unsafe stage list with a code (`self_review`, `g1_missing`, ...) and the
 *   server repeats it on save. An owner must read what is wrong and what to do about it, beside
 *   the row it concerns, never a code. Every code has a sentence here, typed against core's
 *   closed list so a new code that arrives without words fails the type check. A refused write
 *   is explained from the server's error code (never its message) and, for an unsafe list, the
 *   server's own problems are read from the refusal so the same sentences appear. Pure.
 *
 * Exports: PROBLEM_WORDS, problemWords(), problemsOf(), pipelineErrorText(), KIND_LABEL,
 *   LANE_LABEL, LANE_BLURB, LANE_ORDER, tagWords(), SEVERITY_LABEL, SEVERITIES, FULL_NOT_LIVE.
 * Depends on: api/api-error, api/describe-error, schemas/pipelines, zod.
 */

import { z } from 'zod';
import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import { PipelineProblem } from '#/schemas/pipelines.js';
import type { PipelineProblem as Problem } from '#/schemas/pipelines.js';
import type { ProblemCode } from '#/types/pipeline-ui.types.js';

export const PROBLEM_WORDS: Readonly<Record<ProblemCode, string>> = {
  merge_missing: 'The Merge stage is missing. Every pipeline ends by merging.',
  merge_not_last: 'Merge has to be the last stage, and there can be only one.',
  duplicate_stage_id: 'Two stages share an id. Each stage needs its own.',
  too_many_stages: 'There are too many stages. A pipeline holds at most 12.',
  no_writer: 'Nothing writes the change. Add a writer, such as the Implementer.',
  g1_missing: 'The independent gate G1 is missing. It is required after the last writer.',
  g1_duplicate: 'G1 appears more than once. It runs once, after the last writer.',
  g1_before_writer:
    'G1 sits above a writer. It has to come after the last writer so it judges the finished work.',
  writer_after_check:
    'A writer comes after a check. Writers go first; a check cannot be followed by more writing.',
  unknown_agent: 'This stage names an agent that does not exist. Pick one from the list.',
  agent_unavailable:
    'This agent is switched off or archived. Pick another, or switch it on under Agents.',
  role_mismatch:
    'This setting does not fit the agent’s role. Red proof is for test writers; check settings are for reviewers.',
  reviewer_first: 'A reviewer needs something to review. Put a writer above it.',
  self_review:
    'This agent also writes in this pipeline, so it would approve its own work. Pick a different agent.',
  group_writer: 'A group can hold checks only, not writers.',
  group_size: 'A group holds 2 to 4 checks.',
  human_position:
    'The human sign-off has to come after every check, and there can be only one.',
  rework_target: '“Send back to” has to be a writer above this stage.',
  script_invalid:
    'The command or folder is not allowed. Write a one-line command and a folder inside the repository.',
  review_tool_missing:
    'This agent cannot report a review. Give it the “submit review” tool under Agents.',
  routing_writer: 'A rule can add a reviewer or a researcher, never a writer.',
  duplicate_rule_id: 'Two rules share an id. Each rule needs its own.',
};

/** The sentence for one problem. */
export const problemWords = (problem: Problem): string => PROBLEM_WORDS[problem.code];

/** The problems a refused write carries (`error.problems`), or none. */
export function problemsOf(error: unknown): Problem[] {
  if (!(error instanceof ApiError)) {
    return [];
  }

  const body = error.body as { error?: { problems?: unknown } } | null;
  const parsed = z.array(PipelineProblem).safeParse(body?.error?.problems);

  return parsed.success ? parsed.data : [];
}

/** What a refused write says, from the server's error code. */
export function pipelineErrorText(error: unknown): { title: string; detail: string } {
  if (error instanceof ApiError && error.kind === 'http') {
    switch (error.code) {
      case 'pipeline_invalid':
        return {
          title: 'This pipeline cannot be saved',
          detail: 'Fix the problems listed beside the stages, then save again.',
        };
      case 'routing_invalid':
        return {
          title: 'These rules cannot be saved',
          detail: 'Fix the problems listed beside the rules, then save again.',
        };
      case 'not_overridden':
        return {
          title: 'Nothing to reset',
          detail:
            'This lane already follows the default, so there is nothing to put back.',
        };
      case 'lane_unknown':
        return {
          title: 'No such lane',
          detail: 'Forge knows Express, Standard and Full.',
        };
      case 'project_not_found':
        return {
          title: 'This project is gone',
          detail: 'It may have been deleted. Go back to the project list.',
        };
      case 'invalid_request':
        return {
          title: 'Forge did not accept this',
          detail:
            'A field is missing or out of range. The reason needs at least 3 characters.',
        };
      default:
        break;
    }
  }

  return describeError(error);
}

export const KIND_LABEL = {
  agent: 'Agent',
  script_gate: 'Script gate',
  group: 'Run-together group',
  human: 'Human sign-off',
  merge: 'Merge',
} as const;

export const LANE_ORDER = ['express', 'standard', 'full'] as const;

export const LANE_LABEL = {
  express: 'Express',
  standard: 'Standard',
  full: 'Full',
} as const;

export const LANE_BLURB = {
  express: 'Small, low-risk changes: one Worker, then the gate.',
  standard: 'Everyday changes: tests first, the implementation, the gate, then a review.',
  full: 'Large or risky changes: tests, the gate, a review and critique, then your sign-off.',
} as const;

export const FULL_NOT_LIVE =
  'Runs from the next update; Full tickets wait until then. You can edit it now.';

export const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;

export const SEVERITY_LABEL = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
} as const;

/** The tag on a lane: where its pipeline comes from, in the scope being viewed. */
export function tagWords(
  tags: readonly string[],
  scope: 'company' | 'project',
): { label: string; tone: 'plain' | 'attn' } {
  if (scope === 'project') {
    return tags.includes('project')
      ? { label: 'Changed from company default', tone: 'attn' }
      : { label: 'Same as company default', tone: 'plain' };
  }

  return tags.includes('edited')
    ? { label: 'Edited', tone: 'attn' }
    : { label: 'Built-in', tone: 'plain' };
}
