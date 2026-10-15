/**
 * Project detection — which ecosystems a repository uses and which checks to suggest.
 *
 * Why: when a user registers a clone, typing the test, lint and build commands from memory is
 *   the step most likely to be skipped or wrong, and a project with no checks has nothing for
 *   the gates to re-run (d-0095). Looking at the files in the repository root gives a sensible
 *   starting list the user can edit before saving. The result is a suggestion only: nothing
 *   here runs a command, and a repository Forge cannot read gets no checks, never a guessed one.
 *
 * Exports: detectProject().
 * Depends on: @forge/core (ProjectCheck), domain/ecosystems/registry, types/detect-project. No IO.
 */

import type { ProjectCheck } from '@forge/core';
import { ECOSYSTEMS } from '#/domain/ecosystems/registry.js';
import type { DetectedProject, DetectionInput } from '#/types/detect-project.types.js';

/** A root-level glob (`go.mod`, `*.py`) as a case-insensitive matcher; patterns with a folder part never match a bare name. */
function matcher(glob: string): RegExp | null {
  if (glob.includes('/')) {
    return null;
  }

  const source = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');

  return new RegExp(`^${source}$`, 'i');
}

function ecosystemsOf(entries: readonly string[]): string[] {
  return ECOSYSTEMS.filter((eco) =>
    eco.detect.some((glob) => {
      const match = matcher(glob);

      return match !== null && entries.some((name) => match.test(name));
    }),
  ).map((eco) => eco.id);
}

const NODE_SCRIPTS: readonly { script: string; role: ProjectCheck['role'] }[] = [
  { script: 'lint', role: 'lint' },
  { script: 'typecheck', role: 'typecheck' },
  { script: 'test', role: 'test' },
  { script: 'build', role: 'build' },
  { script: 'format:check', role: 'format' },
];

function packageManager(entries: readonly string[]): 'pnpm' | 'yarn' | 'npm' {
  if (entries.includes('pnpm-lock.yaml')) {
    return 'pnpm';
  }

  return entries.includes('yarn.lock') ? 'yarn' : 'npm';
}

function nodeChecks(input: DetectionInput): ProjectCheck[] {
  const pkg = input.packageJson;
  const scripts =
    typeof pkg === 'object' && pkg !== null && 'scripts' in pkg ? pkg.scripts : undefined;

  if (typeof scripts !== 'object' || scripts === null) {
    return [];
  }

  const manager = packageManager(input.rootEntries);

  return NODE_SCRIPTS.filter(
    ({ script }) => typeof Reflect.get(scripts, script) === 'string',
  ).map(({ script, role }) => ({
    name: script,
    role,
    command: `${manager} run ${script}`,
  }));
}

const FIXED_CHECKS: Readonly<Record<string, readonly ProjectCheck[]>> = {
  go: [
    { name: 'vet', role: 'lint', command: 'go vet ./...' },
    { name: 'test', role: 'test', command: 'go test ./...' },
    { name: 'build', role: 'build', command: 'go build ./...' },
  ],
  rust: [
    { name: 'test', role: 'test', command: 'cargo test' },
    { name: 'build', role: 'build', command: 'cargo build' },
  ],
  python: [{ name: 'test', role: 'test', command: 'python -m pytest' }],
};

/** What the root of a repository says about its languages and the checks worth running. */
export function detectProject(input: DetectionInput): DetectedProject {
  const ecosystems = ecosystemsOf(input.rootEntries);
  const checks = ecosystems.flatMap((id) =>
    id === 'node' ? nodeChecks(input) : [...(FIXED_CHECKS[id] ?? [])],
  );

  return { ecosystems, checks };
}
