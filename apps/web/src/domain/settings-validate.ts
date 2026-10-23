/**
 * Settings validation: the problems that would make the server refuse a project-settings save,
 * found before the owner clicks Save.
 *
 * Why: a refusal after the click costs a round trip and loses the owner's place; the same rules
 *   the server applies (a harness named, a concurrency within the company's limit, unique
 *   check names, a working folder inside the repository, valid setup steps, a Director flow that keeps its locked
 *   steps, valid research host lists) are checked as the draft changes and shown beside the
 *   field. Pure.
 *
 * Exports: validateDraft().
 * Depends on: domain/director-override, domain/director-settings, domain/research-narrowing, domain/setup-draft,
 *   types/project-settings.types. No IO.
 */

import { directorIssues } from '#/domain/director-override.js';
import { effectiveDirector } from '#/domain/director-settings.js';
import * as narrowing from '#/domain/research-narrowing.js';
import { setupIssues } from '#/domain/setup-draft.js';
import type {
  SettingsDraft,
  SettingsIssue,
  SettingsSnapshot,
} from '#/types/project-settings.types.js';

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

  if (draft.setup.overridden) {
    for (const message of setupIssues(draft.setup.value)) {
      issues.push({ field: 'setup', message });
    }
  }

  issues.push(...narrowing.researchIssues(draft.research));

  if (draft.director.overridden) {
    const seen = effectiveDirector(snapshot.company.director, draft.director.value);

    for (const message of directorIssues(seen, draft.director.value)) {
      issues.push({ field: 'director', message });
    }
  }

  return issues;
}
