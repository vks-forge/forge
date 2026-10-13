/**
 * Gate-configuration guard — the Worker may not edit the rules it is judged by.
 *
 * Why: the project's lint, typecheck and test commands are the independent half of
 *   verification. If the Worker can loosen `eslint.config.js`, exclude files in
 *   `vitest.config.ts`, relax `tsconfig.json` or rewrite the `package.json` script a gate
 *   runs, those checks pass without proving anything. Any change to such a file is a
 *   finding; a human changes gate configuration, not the Worker.
 *
 * Rules: a changed path whose file name matches `vitest.config.*`, `jest.config.*`,
 *   `eslint.config.*`, `.eslintrc*`, `tsconfig*.json` or `.prettierrc*`; or a changed
 *   `package.json` line defining a script named by a project command (`pnpm test`,
 *   `npm run lint`, `yarn typecheck`) or its `pre`/`post` hook. Scripts are matched by key
 *   on changed lines, not by parsing the full file, so a same-named key elsewhere in the
 *   file also trips it.
 *
 * Exports: checkGateConfig().
 * Depends on: @forge/core (ProjectConfig, WorktreeDiff), shared/paths. No IO.
 */

import type { GateFinding, ProjectConfig, WorktreeDiff } from '@forge/core';
import { foldPath } from '#/shared/paths.js';
import type { CheckOutcome, PatchFile } from '#/types/check.types.js';

const CONFIG_NAME =
  /^(vitest\.config\..+|jest\.config\..+|eslint\.config\..+|\.eslintrc.*|tsconfig.*\.json|\.prettierrc.*)$/;

const SCRIPT_REF = /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?([\w:.-]+)/g;
const JSON_KEY = /^\s*"([^"]+)"\s*:/;

function baseName(path: string): string {
  return foldPath(path).split('/').pop() ?? '';
}

/** Script names a command string runs through a package manager, with pre/post hooks. */
function referencedScripts(commands: ProjectConfig['commands']): Set<string> {
  const names = new Set<string>();
  for (const command of Object.values(commands)) {
    for (const m of (command ?? '').matchAll(SCRIPT_REF)) {
      const name = (m[1] as string).toLowerCase();
      names.add(name);
      names.add(`pre${name}`);
      names.add(`post${name}`);
    }
  }

  return names;
}

function changedScripts(
  patch: readonly PatchFile[],
  scripts: ReadonlySet<string>,
): string[] {
  const hits = new Set<string>();
  for (const file of patch) {
    if (baseName(file.path) !== 'package.json') {
      continue;
    }

    for (const line of [...file.added, ...file.removed]) {
      const key = JSON_KEY.exec(line)?.[1]?.toLowerCase();
      if (key !== undefined && scripts.has(key)) {
        hits.add(key);
      }
    }
  }

  return [...hits];
}

/** Fails on any change to gate configuration or to a script the project's commands run. */
export function checkGateConfig(
  diff: WorktreeDiff,
  patch: readonly PatchFile[],
  commands: ProjectConfig['commands'],
): CheckOutcome {
  const findings: GateFinding[] = [];
  for (const f of diff.files) {
    if (CONFIG_NAME.test(baseName(f.path))) {
      findings.push({
        check: 'gate-config',
        message: `${f.path}: gate configuration changed by the Worker (status ${f.status})`,
      });
    }
  }

  for (const name of changedScripts(patch, referencedScripts(commands))) {
    findings.push({
      check: 'gate-config',
      message: `package.json: script "${name}" used by a project check was changed`,
    });
  }

  const details =
    findings.length === 0
      ? 'No gate configuration was changed.'
      : findings.map((f) => `- ${f.message}`).join('\n');

  return {
    name: 'gate-config',
    status: findings.length === 0 ? 'passed' : 'failed',
    findings,
    details,
  };
}
