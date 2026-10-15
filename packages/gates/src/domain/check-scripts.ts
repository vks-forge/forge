/**
 * Check scripts — files in the worktree that a project check command runs by path.
 *
 * Why: a check such as `./scripts/test.sh`, `./gradlew test` or `bin/test` is an
 *   unattended allow-listed command, and the script it names is an ordinary file in the
 *   Worker's worktree. If the Worker may edit it to `exit 0`, G1 re-runs the edited script,
 *   sees green, and proves nothing. This module lists those files so the gate-config guard
 *   treats a change to any of them like a change to `eslint.config.js`: a finding, because a
 *   human changes what the gate runs, not the Worker.
 *
 * Exports: checkScriptPaths().
 * Depends on: @forge/core (ProjectConfig), shared/paths. No IO.
 */

import type { ProjectConfig } from '@forge/core';
import { foldPath } from '#/shared/paths.js';

const SEGMENT_SPLIT = /&&|\|\||;|\|/;
/** Wrapper scripts that live at the project root and are run by bare or `./` name. */
const LAUNCHERS = new Set(['gradlew', 'gradlew.bat', 'mvnw', 'mvnw.cmd']);
const SCRIPT_FILE = /\.(sh|bash|zsh|ps1|bat|cmd)$/;

const unquote = (token: string): string => token.replace(/^["']|["']$/g, '');

/** A path inside the worktree: not absolute, not drive/UNC, not `~`, not climbing out. */
function insideWorktree(folded: string): boolean {
  return !/^([a-z]:|\/|~)/.test(folded) && !/^\.\.(\/|$)/.test(folded);
}

/**
 * Worktree-relative, folded paths of the scripts the check commands run: the first word of
 * a command when it is a path or a launcher (`gradlew`, `mvnw`), and any word that names a
 * shell or batch script (`bash scripts/check.sh`). A `cd <dir> &&` before it prefixes the path.
 */
export function checkScriptPaths(checks: ProjectConfig['checks']): Set<string> {
  const paths = new Set<string>();
  for (const { command } of checks) {
    let dir = '';
    for (const segment of command.split(SEGMENT_SPLIT)) {
      const tokens = segment
        .trim()
        .split(/\s+/)
        .filter((t) => t !== '')
        .map(unquote);

      const first = foldPath(tokens[0] ?? '');
      if (first === 'cd' && tokens[1] !== undefined) {
        dir = foldPath(tokens[1]).replace(/\/+$/, '');
        continue;
      }

      const candidates = tokens
        .filter((t, i) => {
          const runsByPath = i === 0 && (/[/\\]/.test(t) || LAUNCHERS.has(first));

          return runsByPath || SCRIPT_FILE.test(foldPath(t));
        })
        .map((t) => foldPath(t));

      for (const c of candidates) {
        for (const p of dir === '' ? [c] : [c, `${dir}/${c}`]) {
          if (insideWorktree(p)) {
            paths.add(p);
          }
        }
      }
    }
  }

  return paths;
}
