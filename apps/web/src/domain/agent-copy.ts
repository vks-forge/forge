/**
 * The words of the agent screens: tags, roles, model labels, refusals and test failures.
 *
 * Why: the server answers in codes (`role_bounds`, `agent_required`) and families (`quota`,
 *   `stall`); the owner needs to know what happened and what to do next. Keeping every
 *   sentence in one place makes the wording consistent between the list, the editor, the
 *   dialogs and the test panel, and lets a test pin that a code never reaches the screen
 *   raw. The choice of sentence reads the error's `code` or family, never its message text.
 *
 * Exports: ROLE_INFO, ROLE_OPTIONS, TAG_ORDER, tagInfo(), modelCostWords(), agentErrorText(),
 *   errorIssues(), testFailureWords(), isVersionConflict(), defaultReason().
 * Depends on: api/api-error, api/describe-error, schemas/agents, types/agent-ui.types.
 */

import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import type { AgentRole, AgentTag, HarnessModel } from '#/schemas/agents.js';
import type { AgentAction } from '#/types/agent-ui.types.js';

export const ROLE_INFO: Readonly<Record<AgentRole, { label: string; blurb: string }>> = {
  writer: { label: 'Writer', blurb: 'Changes files to do a ticket.' },
  reviewer: {
    label: 'Reviewer',
    blurb: 'Reads a change and reports what it finds. Cannot edit or run commands.',
  },
  tester: {
    label: 'Tester',
    blurb: 'Writes and runs tests. May change only the paths you list.',
  },
  researcher: {
    label: 'Researcher',
    blurb: 'Reads and looks things up. Cannot edit or run commands.',
  },
};

export const ROLE_OPTIONS = (Object.keys(ROLE_INFO) as AgentRole[]).map((role) => ({
  value: role,
  label: ROLE_INFO[role].label,
  description: ROLE_INFO[role].blurb,
}));

/** Tags shown on a row, most important first. */
export const TAG_ORDER: readonly AgentTag[] = [
  'builtin',
  'company',
  'project',
  'overridden',
  'disabled',
  'archived',
];

/** The label of a tag; a built-in changed from its shipped text reads "edited" on the company screen. */
export function tagInfo(
  tag: AgentTag,
  scope: 'company' | 'project',
): { label: string; tone: 'plain' | 'attn' | 'quiet' } {
  switch (tag) {
    case 'builtin':
      return { label: 'built-in', tone: 'plain' };
    case 'company':
      return { label: 'company', tone: 'plain' };
    case 'project':
      return { label: 'project', tone: 'plain' };
    case 'overridden':
      return { label: scope === 'project' ? 'overridden' : 'edited', tone: 'attn' };
    case 'disabled':
      return { label: 'disabled', tone: 'quiet' };
    case 'archived':
      return { label: 'archived', tone: 'quiet' };
  }
}

const SPEED = { fast: 'fast', balanced: 'balanced', deep: 'deep' } as const;
const COST = { low: 'low cost', medium: 'medium cost', high: 'high cost' } as const;

/** "fast, low cost" for a model row. */
export function modelCostWords(model: HarnessModel): string {
  return `${SPEED[model.speed]}, ${COST[model.cost]}`;
}

const REFUSALS: Readonly<Record<string, { title: string; detail: string }>> = {
  version_conflict: {
    title: 'These agents changed since you opened them',
    detail: 'Someone saved first. Reload the latest and make your change again.',
  },
  name_taken: {
    title: 'That name is taken',
    detail: 'Another agent already has it. Pick a different name.',
  },
  invalid_name: {
    title: 'That name cannot become an id',
    detail:
      'Use letters and numbers, between 2 and 48 characters, starting with a letter.',
  },
  role_bounds: {
    title: 'This agent goes beyond its role',
    detail:
      'A reviewer or researcher cannot hold tools that edit or run code, and a writer or tester needs a write scope.',
  },
  unknown_tool: {
    title: 'A chosen tool does not exist',
    detail: 'It is not in the tool catalogue. Untick it and save again.',
  },
  forge_default_not_allowed: {
    title: 'Pick a model',
    detail: 'Only the built-in implementer can follow the Forge default (lane) model.',
  },
  agent_required: {
    title: 'The implementer is needed',
    detail:
      'It cannot be switched off or archived until a pipeline can name another writer.',
  },
  builtin_locked: {
    title: 'Built-in agents stay in the list',
    detail:
      'Edit it instead, or switch it off for one project in that project’s settings.',
  },
  not_builtin: {
    title: 'Only built-in agents can be reset',
    detail: 'This agent has no shipped version to go back to.',
  },
  not_overridden: {
    title: 'Nothing to reset',
    detail: 'This agent already matches its default.',
  },
  override_fields: {
    title: 'A project can change only two things',
    detail:
      'Instructions and where the agent runs. Everything else follows the company agent.',
  },
  agent_not_found: {
    title: 'That agent is gone',
    detail: 'The list has been refreshed.',
  },
  project_not_found: {
    title: 'Forge does not know this project',
    detail: 'Open it from the project switcher and try again.',
  },
  harness_not_ready: {
    title: 'The harness cannot run a test',
    detail: 'Fix what is listed below, then test again.',
  },
  test_in_progress: {
    title: 'A test is already running on this harness',
    detail: 'Wait for it to finish, then try again.',
  },
  draft_invalid: {
    title: 'The Director’s draft broke a rule',
    detail: 'Nothing was saved. Change the description and ask again.',
  },
  draft_failed: {
    title: 'The Director could not write a draft',
    detail: 'Try again, or describe the agent a little differently.',
  },
  step_timeout: {
    title: 'The Director took too long',
    detail: 'It is limited to two minutes. Try a shorter description.',
  },
  not_available: {
    title: 'No Director model is connected',
    detail: 'Connect a harness first, then try again.',
  },
};

/** Plain words for a failed agent call; an unlisted code falls back to the server's own message. */
export function agentErrorText(error: unknown): { title: string; detail: string } {
  if (error instanceof ApiError && error.code !== undefined) {
    const known = REFUSALS[error.code];
    if (known) {
      // The server names the reasons a harness cannot run in plain words; keep them.
      return error.code === 'harness_not_ready' && error.message
        ? { title: known.title, detail: error.message }
        : known;
    }

    if (error.code === 'invalid_request' || error.code === 'project_required') {
      return { title: 'Something in the form is not valid', detail: error.message };
    }
  }

  return describeError(error);
}

/** The per-field problems the server listed under `error.issues`, such as a draft's broken bounds. */
export function errorIssues(error: unknown): readonly string[] {
  if (!(error instanceof ApiError)) {
    return [];
  }

  const body = error.body as { error?: { issues?: unknown } } | null | undefined;
  const issues = body?.error?.issues;
  if (!Array.isArray(issues)) {
    return [];
  }

  return issues
    .map((issue: unknown) => {
      const item = issue as { path?: unknown; message?: unknown };
      const where = Array.isArray(item.path) ? item.path.join('.') : '';
      const message = typeof item.message === 'string' ? item.message : '';

      return where === '' ? message : `${where}: ${message}`;
    })
    .filter((line) => line !== '');
}

export function isVersionConflict(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'version_conflict';
}

const FAILURES: Readonly<Record<string, { what: string; fix: string }>> = {
  auth: {
    what: 'The harness is not signed in.',
    fix: 'Sign in on the harness page, then test again.',
  },
  quota: {
    what: 'The harness has no quota left right now.',
    fix: 'Wait for it to reset, or run the agent on another harness.',
  },
  rate_limit: {
    what: 'The harness is being rate limited.',
    fix: 'Wait a minute and test again.',
  },
  budget: {
    what: 'The call reached its $0.10 limit before it could answer.',
    fix: 'Shorten the instructions, or choose a cheaper model.',
  },
  stall: {
    what: 'The harness stopped answering.',
    fix: 'Test again; if it repeats, check the harness page.',
  },
  refusal: {
    what: 'The model declined to answer.',
    fix: 'Read the instructions for anything it could object to.',
  },
  crash: {
    what: 'The harness crashed while answering.',
    fix: 'Run its check on the harness page, then test again.',
  },
};

/** What a failed test means and what to try, from the error family. */
export function testFailureWords(family: string): { what: string; fix: string } {
  return (
    FAILURES[family] ?? {
      what: 'The test failed for a reason Forge could not identify.',
      fix: 'Test again; if it repeats, check the harness page.',
    }
  );
}

const REASONS: Readonly<Record<AgentAction | 'duplicate', string>> = {
  reset: 'Reset to the default',
  archive: 'Archived from the agents list',
  unarchive: 'Brought back from the archive',
  disable: 'Switched off for this project',
  enable: 'Switched back on for this project',
  duplicate: 'Copied from another agent',
};

/** A reason the owner can accept with one click; the history shows it. */
export function defaultReason(action: AgentAction | 'duplicate'): string {
  return REASONS[action];
}
