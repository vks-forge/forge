/**
 * Pipeline stage rules — what makes one stage on its own acceptable.
 *
 * Why: the list-level rules (order, G1, rework edges) are only meaningful when each stage is itself
 *   sound: its agent exists and can run, its fields fit the agent's role (a red proof needs a tester,
 *   a writer has no blocking-findings policy), a check agent can actually report a review, a script's
 *   command and folder stay inside the worktree, and a group holds two to four members that are all
 *   real checks or all writers whose write scopes cannot meet (two writers in one worktree must
 *   never be able to edit the same file). These
 *   per-stage checks are shared by the save door, the ticket snapshot and the routing rules, so they
 *   live apart from the list rules that arrange the stages.
 *
 * Exports: REVIEW_TOOL, problem(), isUsable(), rolesOf(), canSubmit(), agentProblems(), scriptProblems(),
 *   groupProblems().
 * Depends on: domain/scope-overlap, schemas/agent, schemas/pipeline, types/pipeline-rules. No IO.
 */

import { scopesOverlap } from '#/domain/scope-overlap.js';
import type { AgentRole } from '#/schemas/agent.js';
import type { PipelineProblem, Stage } from '#/schemas/pipeline.js';
import type { AgentStageOf, RosterEntry } from '#/types/pipeline-rules.types.js';

/** The tool a check agent reports through; an agent without it cannot finish a review. */
export const REVIEW_TOOL = 'mcp__forge__submit_review';

export const problem = (
  code: PipelineProblem['code'],
  message: string,
  stage_id?: string,
): PipelineProblem => ({
  code,
  message,
  ...(stage_id === undefined ? {} : { stage_id }),
});

export const isUsable = (e: RosterEntry): boolean =>
  !e.tags.includes('disabled') && !e.tags.includes('archived');

export const rolesOf = (roster: readonly RosterEntry[]): Record<string, AgentRole> =>
  Object.fromEntries(roster.map((e) => [e.id, e.definition.role]));

export const canSubmit = (e: RosterEntry): boolean =>
  e.definition.tools === 'lane_default' || e.definition.tools.includes(REVIEW_TOOL);

/** Id and role problems of one agent stage: known, usable, and fields that fit its role. */
export function agentProblems(
  stage: AgentStageOf,
  entry: RosterEntry | undefined,
): PipelineProblem[] {
  if (!entry) {
    return [
      problem(
        'unknown_agent',
        `${stage.label}: agent "${stage.agent}" does not exist`,
        stage.id,
      ),
    ];
  }

  const out: PipelineProblem[] = [];
  if (!isUsable(entry)) {
    out.push(
      problem(
        'agent_unavailable',
        `${stage.label}: agent "${entry.definition.name}" is disabled or archived`,
        stage.id,
      ),
    );
  }

  const role = entry.definition.role;
  const writer = role === 'writer' || role === 'tester';
  if (stage.proof !== undefined && role !== 'tester') {
    out.push(
      problem(
        'role_mismatch',
        `${stage.label}: a red proof needs a tester agent`,
        stage.id,
      ),
    );
  }

  const policy =
    stage.rework_to !== undefined ||
    stage.on_blocking !== undefined ||
    stage.blocking !== undefined;

  if (writer && policy) {
    out.push(
      problem(
        'role_mismatch',
        `${stage.label}: a writer has no blocking-findings policy`,
        stage.id,
      ),
    );
  }

  if (!writer && !canSubmit(entry)) {
    out.push(
      problem(
        'review_tool_missing',
        `${stage.label}: agent "${entry.definition.name}" cannot report a review (it lacks submit_review)`,
        stage.id,
      ),
    );
  }

  return out;
}

export function scriptProblems(
  stage: Extract<Stage, { kind: 'script_gate' }>,
): PipelineProblem[] {
  if ('builtin' in stage.run) {
    return [];
  }

  const { command, cwd } = stage.run;
  const bad =
    command.trim() === '' ||
    /[\r\n]/.test(command) ||
    (cwd !== undefined &&
      (/^([a-z]:)?[\\/]/i.test(cwd) || cwd.split(/[\\/]/).includes('..')));

  return bad
    ? [
        problem(
          'script_invalid',
          `${stage.label}: the command or folder is not allowed`,
          stage.id,
        ),
      ]
    : [];
}

/** True when `m` is an agent stage whose agent is a writer or tester. */
const isWriterMember = (
  m: Extract<Stage, { kind: 'group' }>['members'][number],
  entries: ReadonlyMap<string, RosterEntry>,
): boolean => {
  if (m.kind !== 'agent') {
    return false;
  }

  const role = entries.get(m.agent)?.definition.role;

  return role === 'writer' || role === 'tester';
};

/**
 * A group of writers: every member a writer agent without a red proof, each agent once, and write
 * scopes that cannot meet (so side-by-side writers in one worktree never edit the same file).
 */
function writerGroupProblems(
  group: Extract<Stage, { kind: 'group' }>,
  entries: ReadonlyMap<string, RosterEntry>,
): PipelineProblem[] {
  const out: PipelineProblem[] = [];
  const members = group.members.flatMap((m) => (m.kind === 'agent' ? [m] : []));
  const scopeOf = (agent: string): readonly string[] =>
    entries.get(agent)?.definition.write_scope ?? [];

  for (const m of members) {
    out.push(...agentProblems(m, entries.get(m.agent)));
    if (m.proof !== undefined) {
      out.push(
        problem(
          'writer_group_proof',
          `${m.label}: a red proof cannot run inside a group`,
          m.id,
        ),
      );
    }
  }

  for (const [i, a] of members.entries()) {
    for (const b of members.slice(i + 1)) {
      if (a.agent === b.agent || scopesOverlap(scopeOf(a.agent), scopeOf(b.agent))) {
        out.push(
          problem(
            'writer_scope_overlap',
            `${group.label}: ${a.label} and ${b.label} could write the same files; give each agent its own folders`,
            b.id,
          ),
        );
      }
    }
  }

  return out;
}

/** Group shape: 2 to 4 members, all checks or all writers (never mixed), and no G1 inside. */
export function groupProblems(
  group: Extract<Stage, { kind: 'group' }>,
  entries: ReadonlyMap<string, RosterEntry>,
): PipelineProblem[] {
  const out: PipelineProblem[] = [];
  if (group.members.length < 2 || group.members.length > 4) {
    out.push(
      problem('group_size', `${group.label}: a group holds 2 to 4 members`, group.id),
    );
  }

  const writers = group.members.filter((m) => isWriterMember(m, entries));
  if (writers.length === group.members.length && writers.length > 0) {
    return [...out, ...writerGroupProblems(group, entries)];
  }

  if (writers.length > 0) {
    out.push(
      problem(
        'group_mixed',
        `${group.label}: a group holds checks only or writers only`,
        group.id,
      ),
    );
  }

  for (const m of group.members) {
    if (m.kind === 'agent') {
      if (isWriterMember(m, entries)) {
        out.push(
          problem(
            'group_writer',
            `${m.label}: a group of checks cannot hold a writer`,
            m.id,
          ),
        );
      } else {
        out.push(...agentProblems(m, entries.get(m.agent)));
      }
    } else {
      out.push(...scriptProblems(m));
      if ('builtin' in m.run) {
        out.push(
          problem('script_invalid', `${m.label}: G1 cannot run inside a group`, m.id),
        );
      }
    }
  }

  return out;
}
