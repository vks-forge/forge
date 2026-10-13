/**
 * Gate-configuration guard — the Worker may not edit the rules it is judged by.
 *
 * Why: the project's lint, typecheck and test commands are the independent half of
 *   verification. If the Worker can loosen `eslint.config.js`, exclude files in
 *   `vitest.config.ts`, relax `tsconfig.json`, rewrite the `package.json` script a gate
 *   runs, hide hunks with `.gitattributes` or plant a `pnpm.cmd` the shell would run
 *   instead of the real tool, those checks pass without proving anything. Any such change
 *   is a finding; a human changes gate configuration, not the Worker.
 *
 * Rules: a changed path whose file name matches the test/lint/format/type configs
 *   (`vitest.config.*`, `vite.config.*`, `jest.config.*`, `eslint.config.*`, `.eslintrc*`,
 *   `tsconfig*.json`, `.prettierrc*`), their setup and ignore files, package-manager
 *   settings (`.npmrc`, `.yarnrc*`, `pnpm-workspace.yaml`, `.pnpmfile.cjs`), `.gitattributes`,
 *   Babel config, and build/test files of other stacks (`Makefile`, `justfile`,
 *   `pyproject.toml`, `setup.cfg`, `tox.ini`, `pytest.ini`, `conftest.py`); any added or
 *   modified `*.cmd|*.bat|*.exe|*.ps1|*.com` anywhere; or a changed `package.json` line
 *   defining a script named by a project command or its `pre`/`post` hook. The script name
 *   is parsed from the invocation (`pnpm -r test`, `pnpm --filter x run lint`), skipping
 *   flags and the values of value-taking flags. Scripts are matched by key on changed
 *   lines, not by parsing the full file, so a same-named key elsewhere also trips it.
 *
 * Exports: checkGateConfig().
 * Depends on: @forge/core (ProjectConfig, WorktreeDiff), shared/paths. No IO.
 */

import type { GateFinding, ProjectConfig, WorktreeDiff } from '@forge/core';
import { foldPath } from '#/shared/paths.js';
import type { CheckOutcome, PatchFile } from '#/types/check.types.js';

const CONFIG_NAME = new RegExp(
  `^(${[
    'vitest\\.config\\..+',
    'vite\\.config\\..+',
    'vitest\\.workspace\\..+',
    'vitest\\.setup\\..+',
    'jest\\.config\\..+',
    'jest\\.setup\\..+',
    'eslint\\.config\\..+',
    '\\.eslintrc.*',
    '\\.eslintignore',
    'tsconfig.*\\.json',
    '\\.prettierrc.*',
    '\\.prettierignore',
    'babel\\.config\\..+',
    '\\.babelrc.*',
    '\\.npmrc',
    '\\.yarnrc.*',
    'pnpm-workspace\\.yaml',
    '\\.pnpmfile\\.cjs',
    '\\.gitattributes',
    'makefile',
    'justfile',
    'pyproject\\.toml',
    'setup\\.cfg',
    'tox\\.ini',
    'pytest\\.ini',
    'conftest\\.py',
  ].join('|')})$`,
);

/** Files a shell may execute by name; one planted in the tree could stand in for a tool. */
const EXECUTABLE = /\.(cmd|bat|exe|ps1|com)$/;

const PACKAGE_MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun']);
const RUN_WORDS = new Set(['run', 'run-script']);
const VALUE_FLAGS = ['--filter', '-f', '--dir', '-c', '--prefix', '--workspace', '--cwd'];
const JSON_KEY = /^\s*"([^"]+)"\s*:/;
const SEGMENT_SPLIT = /&&|\|\||;|\|/;

function baseName(path: string): string {
  return foldPath(path).split('/').pop() ?? '';
}

/**
 * The script one package-manager invocation runs. `-w` is a value flag for npm but a bare
 * flag for pnpm, so both readings are tried by the caller (`wTakesValue`).
 */
function scriptOf(tokens: readonly string[], wTakesValue: boolean): string | null {
  const valueFlags = new Set(wTakesValue ? [...VALUE_FLAGS, '-w'] : VALUE_FLAGS);
  let sawRun = false;
  for (let i = 1; i < tokens.length; i += 1) {
    const token = (tokens[i] as string).toLowerCase();
    if (token.startsWith('-')) {
      // `--filter=x` carries its value; `--filter x` does not.
      i += valueFlags.has(token) ? 1 : 0;
    } else if (!sawRun && RUN_WORDS.has(token)) {
      sawRun = true;
    } else {
      return token.replace(/^["']|["']$/g, '');
    }
  }

  return null;
}

/** Script names a command string runs through a package manager, with pre/post hooks. */
function referencedScripts(commands: ProjectConfig['commands']): Set<string> {
  const names = new Set<string>();
  for (const command of Object.values(commands)) {
    for (const segment of (command ?? '').split(SEGMENT_SPLIT)) {
      const tokens = segment.trim().split(/\s+/);
      if (!PACKAGE_MANAGERS.has((tokens[0] ?? '').toLowerCase())) {
        continue;
      }

      for (const wTakesValue of [false, true]) {
        const name = scriptOf(tokens, wTakesValue);
        if (name !== null) {
          names.add(name);
          names.add(`pre${name}`);
          names.add(`post${name}`);
        }
      }
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

/** Fails on any change to gate configuration, a planted executable, or a guarded script. */
export function checkGateConfig(
  diff: WorktreeDiff,
  patch: readonly PatchFile[],
  commands: ProjectConfig['commands'],
): CheckOutcome {
  const findings: GateFinding[] = [];
  for (const f of diff.files) {
    const name = baseName(f.path);
    if (CONFIG_NAME.test(name)) {
      findings.push({
        check: 'gate-config',
        message: `${f.path}: gate configuration changed by the Worker (status ${f.status})`,
      });
    }

    if (f.status !== 'D' && EXECUTABLE.test(name)) {
      findings.push({
        check: 'gate-config',
        message: `${f.path}: executable added or modified by the Worker (status ${f.status}); the shell could run it instead of a real tool`,
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
