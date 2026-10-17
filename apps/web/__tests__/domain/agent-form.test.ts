/**
 * Pins: the agent form's pure rules: role changes strip what the new role may not keep, the form
 * is checked against core's role bounds before any request, a budget is read as numbers only at
 * the end, fallbacks reorder, and the Director's model rows follow the harness's own list.
 *
 * Why: the editor must never sit in a state the server would refuse (a reviewer holding an edit
 * tool), and must say what is wrong next to the field instead of after a round trip. These are the
 * rules the screens lean on, pinned without a screen.
 * Depends on: src/domain/agent-form, src/domain/agent-models, src/domain/agent-copy. No IO.
 */

import { describe, expect, it } from 'vitest';
import { ApiError } from '#/api/api-error.js';
import { agentErrorText, errorIssues, testFailureWords } from '#/domain/agent-copy.js';
import {
  changedFields,
  checkForm,
  emptyForm,
  moveItem,
  READ_ONLY_TOOLS,
  switchRole,
  toggleTool,
} from '#/domain/agent-form.js';
import { directorModelChoices, modelItems, modelValue } from '#/domain/agent-models.js';
import { SAMPLE_HARNESS } from '#tests/helpers/forge-data/agent-data.js';

const valid = { ...emptyForm(), name: 'Docs', description: 'Writes docs.' };

describe('agent form', () => {
  it('a new form is a writer with the whole worktree as its scope', () => {
    const form = emptyForm();

    expect(form.role).toBe('writer');
    expect(form.write_scope).toEqual(['**']);
    expect(checkForm(valid).issues).toEqual([]);
  });

  it('switching to a reviewer strips write tools and the write scope', () => {
    const writer = { ...valid, tools: ['read', 'edit', 'shell', 'grep'] };

    const reviewer = switchRole(writer, 'reviewer');

    expect(reviewer.tools).toEqual(['read', 'grep']);
    expect(reviewer.write_scope).toEqual([]);
    expect(checkForm(reviewer).issues).toEqual([]);
  });

  it('a reviewer that had only the lane default is given the read-only set', () => {
    const reviewer = switchRole(valid, 'researcher');

    expect(reviewer.tools).toEqual(READ_ONLY_TOOLS);
  });

  it('switching back to a tester gives test paths to start from', () => {
    const tester = switchRole(switchRole(valid, 'reviewer'), 'tester');

    expect(tester.write_scope).toEqual(['**/*.test.*', '**/__tests__/**']);
  });

  it('names the broken role bound next to its field', () => {
    const bad = { ...valid, role: 'reviewer' as const, tools: ['edit'], write_scope: [] };

    const { value, issues } = checkForm(bad);

    expect(value).toBeUndefined();
    expect(issues).toContainEqual({
      path: 'tools',
      message: 'a reviewer cannot use the write tool "edit"',
    });
  });

  it('asks for a name and a description in words', () => {
    const { issues } = checkForm(emptyForm());

    expect(issues.map((i) => i.message)).toEqual([
      'Give the agent a name.',
      'Say what the agent is for; the Director reads this.',
    ]);
  });

  it('reads a budget only at the end and refuses nonsense', () => {
    const ok = checkForm({ ...valid, budget: { usd: '1.5', minutes: '', turns: '40' } });
    const bad = checkForm({ ...valid, budget: { usd: '0', minutes: '2.5', turns: 'x' } });

    expect(ok.value?.budget).toEqual({ usd: 1.5, turns: 40 });
    expect(bad.issues.map((i) => i.path)).toEqual([
      'budget.usd',
      'budget.minutes',
      'budget.turns',
    ]);
  });

  it('an empty custom model id is a problem on that model', () => {
    const form = {
      ...valid,
      runs_on: { ...valid.runs_on, model: { kind: 'model' as const, id: ' ' } },
    };

    expect(checkForm(form).issues[0]?.path).toBe('runs_on.model');
  });

  it('ticks a tool by leaving the lane default for an explicit list', () => {
    const next = toggleTool(valid, 'read');

    expect(next.tools).toEqual(['read']);
    expect(toggleTool(next, 'read').tools).toEqual([]);
  });

  it('moves an item by one place and stops at the ends', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
  });

  it('names the fields that differ between two forms', () => {
    expect(changedFields(valid, { ...valid, name: 'Docs 2', tools: ['read'] })).toEqual([
      'Name',
      'Tools',
    ]);
  });
});

describe('agent models and words', () => {
  it('offers the Forge default only to the implementer and lists recommended models first', () => {
    const rows = modelItems(SAMPLE_HARNESS.models, 'reviewer', false);

    expect(rows.map((r) => r.value)).toEqual([
      'harness_default',
      'model:opus',
      'model:sonnet',
      'model:haiku',
      'custom',
    ]);

    expect(rows.find((r) => r.value === 'model:opus')?.group).toBe(
      'Recommended for reviewers',
    );

    expect(
      modelItems(SAMPLE_HARNESS.models, 'writer', true).map((r) => r.value),
    ).toContain('forge_default');
  });

  it('shows an unlisted model id as custom', () => {
    expect(modelValue({ kind: 'model', id: 'gpt-x' }, SAMPLE_HARNESS.models)).toBe(
      'custom',
    );

    expect(modelValue({ kind: 'model', id: 'opus' }, SAMPLE_HARNESS.models)).toBe(
      'model:opus',
    );
  });

  it('the Director page uses the harness models, and the built-in list without any', () => {
    expect(directorModelChoices([SAMPLE_HARNESS]).map((c) => c.value)).toEqual([
      'opus',
      'sonnet',
      'haiku',
      'custom',
    ]);

    expect(directorModelChoices(undefined).map((c) => c.value)).toContain('opus');
    expect(
      directorModelChoices([{ ...SAMPLE_HARNESS, models: [] }]).map((c) => c.value),
    ).toContain('sonnet');
  });

  it('turns a server code into words, never the code', () => {
    const error = new ApiError('http', 'raw', { status: 409, code: 'agent_required' });

    expect(agentErrorText(error).title).toBe('The implementer is needed');
    expect(agentErrorText(error).detail).not.toContain('agent_required');
    expect(testFailureWords('quota').what).toContain('no quota');
    expect(testFailureWords('zzz').what).toContain('could not identify');
  });

  it('lists the issues the server sent', () => {
    const error = new ApiError('http', 'broke', {
      status: 422,
      code: 'draft_invalid',
      body: {
        error: {
          code: 'draft_invalid',
          message: 'broke',
          issues: [{ path: ['tools'], message: 'a reviewer cannot use edit' }],
        },
      },
    });

    expect(errorIssues(error)).toEqual(['tools: a reviewer cannot use edit']);
  });
});
