/**
 * Settings draft: the pure rules behind the project-settings editor.
 *
 * Why: a project stores only what it changed, so the editor must know for each field whether
 *   the project overrides it, what it would inherit if it did not, and what document a save
 *   would write. Getting this wrong is quiet and costly: saving an inherited value as an
 *   override freezes it against later company changes, and dropping a key the editor does
 *   not show (git host, gate rules, tool grants) deletes settings made elsewhere. Keeping
 *   the rules here, away from React, lets tests pin them: inherited versus override, clearing
 *   an override, carrying unknown keys through, and what counts as unsaved.
 *
 * Exports: FIELD_KEYS, draftFromSnapshot(), inheritedOf(), docFromDraft(), isDirty(),
 *   validateDraft(), setOverridden(), parseLines(), SAFE_TIER_C.
 * Depends on: @forge/core (BUILTIN_PROJECT_SETTINGS), types/project-settings.types. No IO.
 */

import { BUILTIN_PROJECT_SETTINGS } from '@forge/core';
import type { ProjectCheck } from '@forge/core';
import type {
  FieldKey,
  SettingsDraft,
  SettingsIssue,
  SettingsSnapshot,
} from '#/types/project-settings.types.js';

export const FIELD_KEYS: readonly FieldKey[] = [
  'checks',
  'ecosystems',
  'default_harness',
  'max_concurrent',
  'harness_fallbacks',
  'tier_c_globs',
  'remote',
];

/** The Tier C paths Forge protects by default; a list that drops them weakens the safeguard. */
export const SAFE_TIER_C: readonly string[] = ['.forge/**', '.claude/**', '.github/**'];

/** One entry per non-empty line, trimmed. */
export function parseLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

const lines = (list: readonly string[] | undefined): string => (list ?? []).join('\n');

/** What the field would be if the project did not override it: built-in default or company value. */
export function inheritedOf(
  snapshot: SettingsSnapshot,
  key: FieldKey,
): SettingsDraft[FieldKey]['value'] {
  const engine = snapshot.company.engine;

  switch (key) {
    case 'checks':
      return BUILTIN_PROJECT_SETTINGS.checks;
    case 'ecosystems':
      return lines(BUILTIN_PROJECT_SETTINGS.ecosystems);
    case 'default_harness':
      return BUILTIN_PROJECT_SETTINGS.default_harness;
    case 'max_concurrent':
      return String(engine.max_concurrent_per_project);
    case 'harness_fallbacks':
      return lines(engine.harness_fallbacks);
    case 'tier_c_globs':
      return lines(BUILTIN_PROJECT_SETTINGS.tier_c_globs);
    case 'remote':
      return '';
  }
}

/** The draft a freshly loaded snapshot starts the editor with. */
export function draftFromSnapshot(snapshot: SettingsSnapshot): SettingsDraft {
  const own = snapshot.override;
  const project = snapshot.config.project;
  const field = <T>(key: FieldKey, value: T, inherited: T) => ({
    overridden: key in own,
    value: key in own ? value : inherited,
  });

  return {
    checks: field(
      'checks',
      project.checks,
      inheritedOf(snapshot, 'checks') as readonly ProjectCheck[],
    ),
    ecosystems: field(
      'ecosystems',
      lines(project.ecosystems),
      inheritedOf(snapshot, 'ecosystems') as string,
    ),
    default_harness: field(
      'default_harness',
      project.default_harness,
      inheritedOf(snapshot, 'default_harness') as string,
    ),
    max_concurrent: field(
      'max_concurrent',
      String(project.max_concurrent ?? ''),
      inheritedOf(snapshot, 'max_concurrent') as string,
    ),
    harness_fallbacks: field(
      'harness_fallbacks',
      lines(project.harness_fallbacks),
      inheritedOf(snapshot, 'harness_fallbacks') as string,
    ),
    tier_c_globs: field(
      'tier_c_globs',
      lines(project.tier_c_globs),
      inheritedOf(snapshot, 'tier_c_globs') as string,
    ),
    remote: field('remote', project.remote ?? '', ''),
  };
}

/** Turns an override on or off. Off puts the inherited value back so the editor shows what applies. */
export function setOverridden(
  draft: SettingsDraft,
  snapshot: SettingsSnapshot,
  key: FieldKey,
  overridden: boolean,
): SettingsDraft {
  const current = draft[key];

  return {
    ...draft,
    [key]: {
      overridden,
      value: overridden ? current.value : inheritedOf(snapshot, key),
    },
  };
}

function valueForDoc(key: FieldKey, draft: SettingsDraft): unknown {
  switch (key) {
    case 'checks':
      return draft.checks.value.map((c) => ({
        name: c.name.trim(),
        role: c.role,
        command: c.command.trim(),
        ...(c.cwd && c.cwd.trim() !== '' ? { cwd: c.cwd.trim() } : {}),
      }));
    case 'ecosystems':
      return parseLines(draft.ecosystems.value);
    case 'default_harness':
      return draft.default_harness.value.trim();
    case 'max_concurrent':
      return Number(draft.max_concurrent.value);
    case 'harness_fallbacks':
      return parseLines(draft.harness_fallbacks.value);
    case 'tier_c_globs':
      return parseLines(draft.tier_c_globs.value);
    case 'remote':
      return draft.remote.value.trim();
  }
}

/**
 * The override document a save would write: the saved one, with this editor's fields set or
 * removed. Keys the editor does not show are kept as they are.
 */
export function docFromDraft(
  saved: Readonly<Record<string, unknown>>,
  draft: SettingsDraft,
): Record<string, unknown> {
  const doc: Record<string, unknown> = { ...saved };

  for (const key of FIELD_KEYS) {
    if (draft[key].overridden) {
      doc[key] = valueForDoc(key, draft);
    } else {
      delete doc[key];
    }
  }

  return doc;
}

function stable(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

/** True when saving would write a document different from the one on the server. */
export function isDirty(snapshot: SettingsSnapshot, draft: SettingsDraft): boolean {
  return (
    stable(docFromDraft(snapshot.override, draft)) !==
    stable(docFromDraft(snapshot.override, draftFromSnapshot(snapshot)))
  );
}

/** Problems that would make the server refuse the save, found before the user clicks it. */
export function validateDraft(
  draft: SettingsDraft,
  snapshot: SettingsSnapshot,
): SettingsIssue[] {
  const issues: SettingsIssue[] = [];

  if (draft.default_harness.overridden && draft.default_harness.value.trim() === '') {
    issues.push({ field: 'default_harness', message: 'Name the harness Workers use.' });
  }

  if (draft.max_concurrent.overridden) {
    const n = Number(draft.max_concurrent.value);
    const cap = snapshot.company.engine.max_concurrent_per_project;
    if (!Number.isInteger(n) || n < 1) {
      issues.push({
        field: 'max_concurrent',
        message: 'Use a whole number of 1 or more.',
      });
    } else if (n > cap) {
      issues.push({
        field: 'max_concurrent',
        message: `A project can lower the company limit (${cap}), never raise it.`,
      });
    }
  }

  if (draft.checks.overridden) {
    const names = draft.checks.value.map((c) => c.name.trim());
    if (draft.checks.value.some((c) => c.name.trim() === '' || c.command.trim() === '')) {
      issues.push({
        field: 'checks',
        message: 'Every check needs a name and a command.',
      });
    } else if (new Set(names).size !== names.length) {
      issues.push({ field: 'checks', message: 'Check names must be unique.' });
    }

    if (
      draft.checks.value.some(
        (c) =>
          /^([a-z]:)?[\\/]/i.test(c.cwd ?? '') ||
          /(^|[\\/])\.\.($|[\\/])/.test(c.cwd ?? ''),
      )
    ) {
      issues.push({
        field: 'checks',
        message:
          'A working folder must be inside the repository (no leading slash, no “..”).',
      });
    }
  }

  return issues;
}
