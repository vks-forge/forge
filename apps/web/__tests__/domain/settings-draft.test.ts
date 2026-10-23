/**
 * Pins: the rules of the settings editor: what a project overrides versus inherits, what a
 * save would write, and what blocks it.
 *
 * Why: a wrong rule here is silent and costly. Saving an inherited value as an override
 * freezes it against later company changes; dropping a key the editor does not show deletes
 * settings made elsewhere; allowing a project to raise the company concurrency limit makes
 * the server refuse the save late.
 * Depends on: domain/settings-draft, @forge/core (built-in defaults).
 */

import { BUILTIN_CONFIG } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  dirtyFields,
  docFromDraft,
  draftFromSnapshot,
  inheritedOf,
  isDirty,
  parseLines,
  SCOPE_FIELDS,
  setOverridden,
  validateDraft,
} from '#/domain/settings-draft.js';
import type { SettingsSnapshot } from '#/types/project-settings.types.js';

function snapshot(override: Record<string, unknown> = {}): SettingsSnapshot {
  return {
    config: {
      forge: BUILTIN_CONFIG.forge,
      project: { ...BUILTIN_CONFIG.project, ...override } as never,
    },
    version: { company: 2, project: Object.keys(override).length > 0 ? 3 : 0 },
    warnings: [],
    versions: [],
    override,
    company: {
      ...BUILTIN_CONFIG.forge,
      engine: {
        ...BUILTIN_CONFIG.forge.engine,
        max_concurrent_per_project: 2,
        harness_fallbacks: ['codex'],
      },
    },
  };
}

describe('draftFromSnapshot', () => {
  it('marks only the keys in the saved override as overridden', () => {
    const draft = draftFromSnapshot(snapshot({ default_harness: 'codex' }));

    expect(draft.default_harness).toEqual({ overridden: true, value: 'codex' });
    expect(draft.checks.overridden).toBe(false);
    expect(draft.tier_c_globs.overridden).toBe(false);
  });

  it('shows the company value for an inherited limit and fallback list', () => {
    const draft = draftFromSnapshot(snapshot());

    expect(draft.max_concurrent).toEqual({ overridden: false, value: '2' });
    expect(draft.harness_fallbacks).toEqual({ overridden: false, value: 'codex' });
  });
});

describe('docFromDraft', () => {
  it('writes nothing for a field that is not overridden', () => {
    const snap = snapshot();

    expect(docFromDraft(snap.override, draftFromSnapshot(snap))).toEqual({});
  });

  it('clearing an override removes its key so the project inherits again', () => {
    const snap = snapshot({ default_harness: 'codex', max_concurrent: 1 });
    const cleared = setOverridden(draftFromSnapshot(snap), snap, 'max_concurrent', false);

    expect(docFromDraft(snap.override, cleared)).toEqual({ default_harness: 'codex' });
    expect(cleared.max_concurrent.value).toBe('2');
  });

  it('keeps keys the editor does not show, such as git_host', () => {
    const snap = snapshot({
      git_host: { kind: 'local', remote_path: 'x' },
      remote: 'origin',
    });

    const draft = draftFromSnapshot(snap);

    expect(docFromDraft(snap.override, draft)).toEqual({
      git_host: { kind: 'local', remote_path: 'x' },
      remote: 'origin',
    });
  });

  it('writes typed values: lines become lists and the limit a number', () => {
    const snap = snapshot();
    let draft = setOverridden(draftFromSnapshot(snap), snap, 'ecosystems', true);
    draft = { ...draft, ecosystems: { overridden: true, value: 'node\n\n python ' } };
    draft = { ...draft, max_concurrent: { overridden: true, value: '1' } };

    expect(docFromDraft(snap.override, draft)).toEqual({
      ecosystems: ['node', 'python'],
      max_concurrent: 1,
    });
  });
});

describe('isDirty', () => {
  it('is false for an untouched draft and true after a change', () => {
    const snap = snapshot({ default_harness: 'codex' });
    const draft = draftFromSnapshot(snap);

    expect(isDirty(snap, draft)).toBe(false);
    expect(
      isDirty(snap, {
        ...draft,
        default_harness: { overridden: true, value: 'claude-code' },
      }),
    ).toBe(true);
  });

  it('turning an override on without changing the value is a change (it freezes the value)', () => {
    const snap = snapshot();

    expect(
      isDirty(snap, setOverridden(draftFromSnapshot(snap), snap, 'remote', true)),
    ).toBe(true);
  });
});

describe('validateDraft', () => {
  it('refuses to raise the concurrency above the company limit', () => {
    const snap = snapshot();
    const draft = {
      ...draftFromSnapshot(snap),
      max_concurrent: { overridden: true, value: '5' },
    };

    expect(validateDraft(draft, snap)).toEqual([
      expect.objectContaining({ field: 'max_concurrent' }),
    ]);
  });

  it('refuses unnamed checks, duplicate names and folders outside the repository', () => {
    const snap = snapshot();
    const base = draftFromSnapshot(snap);
    const withChecks = (checks: SettingsSnapshot['config']['project']['checks']) =>
      validateDraft({ ...base, checks: { overridden: true, value: checks } }, snap);

    expect(withChecks([{ name: '', role: 'test', command: 'pnpm test' }])).toHaveLength(
      1,
    );

    expect(
      withChecks([
        { name: 'a', role: 'test', command: 'x' },
        { name: 'a', role: 'lint', command: 'y' },
      ])[0]?.message,
    ).toMatch(/unique/);

    expect(
      withChecks([{ name: 'a', role: 'test', command: 'x', cwd: '../up' }])[0]?.message,
    ).toMatch(/inside the repository/);

    expect(withChecks([{ name: 'a', role: 'test', command: 'x' }])).toEqual([]);
  });
});

describe('helpers', () => {
  it('parseLines trims and drops blanks', () => {
    expect(parseLines(' a \n\n b\n')).toEqual(['a', 'b']);
  });

  it('inheritedOf reads the company, not this project, for limits', () => {
    expect(inheritedOf(snapshot({ max_concurrent: 1 }), 'max_concurrent')).toBe('2');
  });
});

describe('dirtyFields', () => {
  it('is empty for an untouched draft and names only the field that differs', () => {
    const snap = snapshot();
    const draft = draftFromSnapshot(snap);

    expect(dirtyFields(snap, draft).size).toBe(0);

    const edited = { ...draft, default_harness: { overridden: true, value: 'codex' } };

    expect([...dirtyFields(snap, edited)]).toEqual(['default_harness']);
  });

  it('maps each settings tab to its own fields so only that tab shows the dot', () => {
    expect(SCOPE_FIELDS.workers).toContain('default_harness');
    expect(SCOPE_FIELDS.checks).not.toContain('default_harness');
    expect(SCOPE_FIELDS.director).toEqual(['director']);
  });
});

describe('revoking an approved tool rule', () => {
  const rule = (id: string) => ({
    id,
    action: 'shell',
    resource: `make ${id}`,
    effect: 'allow',
    created_at: '2026-10-18T09:30:00.000Z',
    source: { ticket_id: 'SVC-4', interaction_id: 'int-1' },
  });

  const saved = () =>
    snapshot({
      default_harness: 'codex',
      tool_grants: { deny: ['x'], approved: [rule('a'), rule('b')] },
    });

  it('starts with nothing revoked and nothing unsaved', () => {
    const snap = saved();
    const draft = draftFromSnapshot(snap);

    expect(draft.revoked).toEqual([]);
    expect(isDirty(snap, draft)).toBe(false);
    expect(dirtyFields(snap, draft).has('tool_grants')).toBe(false);
  });

  it('removes only the revoked rule from the document and keeps every other grant key', () => {
    const snap = saved();
    const doc = docFromDraft(snap.override, {
      ...draftFromSnapshot(snap),
      revoked: ['a'],
    });

    expect(doc['tool_grants']).toEqual({ deny: ['x'], approved: [rule('b')] });
    expect(doc['default_harness']).toBe('codex');
  });

  it('is unsaved until undone, and the tool grants tab shows the dot', () => {
    const snap = saved();
    const draft = { ...draftFromSnapshot(snap), revoked: ['a'] };

    expect(isDirty(snap, draft)).toBe(true);
    expect(dirtyFields(snap, draft).has('tool_grants')).toBe(true);
    expect(SCOPE_FIELDS.approvals).toEqual(['tool_grants']);
    expect(isDirty(snap, { ...draft, revoked: [] })).toBe(false);
  });

  it('ignores an id that is not in the list and never adds a rule', () => {
    const snap = saved();
    const doc = docFromDraft(snap.override, {
      ...draftFromSnapshot(snap),
      revoked: ['zzz'],
    });

    expect(doc['tool_grants']).toEqual(snap.override['tool_grants']);
  });

  it('leaves a document with no tool grants alone', () => {
    const snap = snapshot({ default_harness: 'codex' });
    const doc = docFromDraft(snap.override, {
      ...draftFromSnapshot(snap),
      revoked: ['a'],
    });

    expect(doc).not.toHaveProperty('tool_grants');
  });
});
