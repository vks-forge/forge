/**
 * The agent editor's form: build it from a definition, check it, change role, turn it back into a body.
 *
 * Why: the owner edits an agent through controls (a budget typed as text, lists as chips), the
 *   server stores strict data, and the role bounds (a reviewer cannot write, a tester must name
 *   its paths) are enforced in core. This module is the pure seam between them. It runs the
 *   same core schema before any request so the owner reads the rule next to the field, not as a
 *   refusal; it turns a half-typed budget into a number only at the end; and changing role
 *   rewrites the parts the new role may not keep (a reviewer loses its write tools and write
 *   scope, a writer gets a scope to start from) so the form never sits in a state the server
 *   would refuse. It never decides policy: core's `AgentInput` does.
 *
 * Exports: READ_ONLY_TOOLS, TEST_GLOBS, emptyForm(), formFromFields(), checkForm(),
 *   switchRole(), toggleTool(), moveItem(), sameForm(), issueAt(), overrideFrom(), changedFields().
 * Depends on: @forge/core (isWriteClassTool), domain/config-path, schemas/agents,
 *   types/agent-ui.types.
 */

import { isWriteClassTool } from '@forge/core';
import { sameValue } from '#/domain/config-path.js';
import { AgentInput } from '#/schemas/agents.js';
import type { AgentFields, AgentRole, ModelChoice, RunsOn } from '#/schemas/agents.js';
import type { AgentForm, BudgetText, FormIssue } from '#/types/agent-ui.types.js';

/** What a reviewer or researcher is given when the owner has not chosen: read, search, look up, comment. */
export const READ_ONLY_TOOLS: readonly string[] = [
  'read',
  'glob',
  'grep',
  'mcp__forge__docs_lookup',
  'mcp__forge__add_comment',
  'mcp__forge__ask_director',
];

/** A tester's starting scope: test files only. */
export const TEST_GLOBS: readonly string[] = ['**/*.test.*', '**/__tests__/**'];

const TEXT_LIMITS = { name: 60, description: 500, instructions: 20_000 } as const;

export function emptyForm(): AgentForm {
  return {
    name: '',
    description: '',
    role: 'writer',
    instructions: '',
    runs_on: {
      harness: 'project_default',
      model: { kind: 'harness_default' },
      fallbacks: [],
    },
    tools: 'lane_default',
    write_scope: ['**'],
    inputs: [],
    output: [],
    skills: [],
    memory: { tags: [], include_rejected: false },
    budget: { usd: '', minutes: '', turns: '' },
  };
}

const text = (value: number | undefined): string =>
  value === undefined ? '' : String(value);

/** The form for a stored definition, a template or a draft. */
export function formFromFields(fields: AgentFields): AgentForm {
  return {
    name: fields.name,
    description: fields.description,
    role: fields.role,
    instructions: fields.instructions,
    runs_on: fields.runs_on,
    tools: fields.tools,
    write_scope: fields.write_scope,
    inputs: fields.inputs,
    output: fields.output,
    skills: fields.skills,
    memory: fields.memory,
    budget: {
      usd: text(fields.budget.usd),
      minutes: text(fields.budget.minutes),
      turns: text(fields.budget.turns),
    },
  };
}

function budgetFrom(budget: BudgetText, issues: FormIssue[]): AgentFields['budget'] {
  const out: { usd?: number; minutes?: number; turns?: number } = {};
  const rows = [
    ['usd', 'a dollar amount above zero', false],
    ['minutes', 'a whole number of minutes above zero', true],
    ['turns', 'a whole number of turns above zero', true],
  ] as const;

  for (const [key, words, whole] of rows) {
    const raw = budget[key].trim();
    if (raw === '') {
      continue;
    }

    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0 || (whole && !Number.isInteger(value))) {
      issues.push({ path: `budget.${key}`, message: `Use ${words}, or leave it blank.` });
    } else {
      out[key] = value;
    }
  }

  return out;
}

function modelIssue(model: ModelChoice, path: string, issues: FormIssue[]): void {
  if (model.kind === 'model' && model.id.trim() === '') {
    issues.push({ path, message: 'Name a model, or pick one from the list.' });
  }
}

/** The issues of the form and, when there are none, the body to send. */
export function checkForm(form: AgentForm): {
  value: AgentFields | undefined;
  issues: readonly FormIssue[];
} {
  const issues: FormIssue[] = [];
  const trimmed = { name: form.name.trim(), description: form.description.trim() };

  if (trimmed.name === '') {
    issues.push({ path: 'name', message: 'Give the agent a name.' });
  }

  if (trimmed.description === '') {
    issues.push({
      path: 'description',
      message: 'Say what the agent is for; the Director reads this.',
    });
  }

  modelIssue(form.runs_on.model, 'runs_on.model', issues);
  form.runs_on.fallbacks.forEach((f, i) =>
    modelIssue(f.model, `runs_on.fallbacks.${i}.model`, issues),
  );

  const budget = budgetFrom(form.budget, issues);
  const candidate = {
    name: trimmed.name,
    description: trimmed.description,
    role: form.role,
    instructions: form.instructions,
    runs_on: form.runs_on,
    tools: form.tools,
    write_scope: form.write_scope,
    inputs: form.inputs,
    output: form.output,
    skills: form.skills,
    memory: form.memory,
    budget,
  };

  const parsed = AgentInput.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.');
      const root = String(issue.path[0] ?? '');
      const limit = TEXT_LIMITS[root as keyof typeof TEXT_LIMITS];

      if (!issues.some((i) => i.path === path || i.path.startsWith(`${path}.`))) {
        issues.push({
          path,
          message:
            limit !== undefined && issue.code === 'too_big'
              ? `Keep this under ${limit.toLocaleString('en-US')} characters.`
              : issue.message,
        });
      }
    }
  }

  return {
    value: issues.length === 0 && parsed.success ? parsed.data : undefined,
    issues,
  };
}

/** The first message for `path` (or any path below it), for showing under a field. */
export function issueAt(issues: readonly FormIssue[], path: string): string | undefined {
  return issues.find((i) => i.path === path || i.path.startsWith(`${path}.`))?.message;
}

/**
 * Switches role and rewrites what the new role may not keep: a reviewer or researcher keeps only
 * read tools (or gets the read-only set) and no write scope; a writer or tester that had no scope
 * gets one to start from.
 */
export function switchRole(form: AgentForm, role: AgentRole): AgentForm {
  if (role === 'reviewer' || role === 'researcher') {
    const kept =
      form.tools === 'lane_default' ? [] : form.tools.filter((t) => !isWriteClassTool(t));

    return {
      ...form,
      role,
      tools: kept.length > 0 ? kept : READ_ONLY_TOOLS,
      write_scope: [],
    };
  }

  const scope =
    form.write_scope.length > 0
      ? form.write_scope
      : role === 'tester'
        ? TEST_GLOBS
        : ['**'];

  return { ...form, role, write_scope: scope };
}

/** Ticks or unticks one tool; the first choice leaves the lane default for an explicit list. */
export function toggleTool(form: AgentForm, id: string): AgentForm {
  const current = form.tools === 'lane_default' ? [] : form.tools;
  const next = current.includes(id) ? current.filter((t) => t !== id) : [...current, id];

  return { ...form, tools: next };
}

/** `list` with the item at `index` moved by `delta` places; the same list at either end. */
export function moveItem<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (to < 0 || to >= list.length) {
    return [...list];
  }

  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(to, 0, item as T);

  return next;
}

export function sameForm(a: AgentForm, b: AgentForm): boolean {
  return sameValue(a, b);
}

/** What a project override of a company agent may carry: instructions and where it runs. */
export function overrideFrom(form: AgentForm): {
  instructions: string;
  runs_on: RunsOn;
} {
  return { instructions: form.instructions, runs_on: form.runs_on };
}

const FIELD_NAMES: readonly (readonly [keyof AgentForm, string])[] = [
  ['name', 'Name'],
  ['description', 'Description'],
  ['role', 'Role'],
  ['instructions', 'Instructions'],
  ['runs_on', 'Runs on'],
  ['tools', 'Tools'],
  ['write_scope', 'Write scope'],
  ['inputs', 'Inputs'],
  ['output', 'Output'],
  ['skills', 'Skills'],
  ['memory', 'Memory'],
  ['budget', 'Budget'],
];

/** The plain names of the fields that differ between two forms, for "what the other save changed". */
export function changedFields(a: AgentForm, b: AgentForm): string[] {
  return FIELD_NAMES.filter(([key]) => !sameValue(a[key], b[key])).map(
    ([, name]) => name,
  );
}
