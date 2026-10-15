/**
 * The tool calls the compatibility session makes, and the two files that prove what ran.
 *
 * Why: the check has to see every class of built-in tool reach the hook (reads, searches,
 *   writes, edits, the shell) and has to see a denial actually stop a tool. The script is
 *   deliberately small and ordered: create a file, read it, search it, list it, edit it, run
 *   a shell command, then try to write a second file whose path contains `denied`, which
 *   the check's hook refuses. If that second file exists afterwards, the build ran a tool
 *   the hook denied; if the first is missing, it refused one the hook allowed. Paths use
 *   forward slashes because the harness accepts them on every platform and a backslash
 *   would have to be escaped through three layers.
 *
 * Exports: sessionScript().
 * Depends on: node:path, types/compat. No IO.
 */

import { join } from 'node:path';
import type { SessionScript } from '#/types/compat/compat.types.js';

const slash = (p: string): string => p.replaceAll('\\', '/');

/** The script for a session whose working folder is `cwd`. */
export function sessionScript(cwd: string): SessionScript {
  const allowedFile = join(cwd, 'compat-a.txt');
  const deniedFile = join(cwd, 'compat-denied.txt');
  const a = slash(allowedFile);

  return {
    allowedFile,
    deniedFile,
    calls: () => [
      { names: ['Write'], input: { file_path: a, content: 'alpha\nbeta\n' } },
      { names: ['Read'], input: { file_path: a } },
      { names: ['Grep'], input: { pattern: 'alpha', path: slash(cwd) } },
      { names: ['Glob'], input: { pattern: '*.txt', path: slash(cwd) } },
      {
        names: ['Edit'],
        input: { file_path: a, old_string: 'beta', new_string: 'gamma' },
      },
      {
        names: ['Bash', 'PowerShell'],
        input: { command: 'echo compat', description: 'echo' },
      },
      {
        names: ['Write'],
        input: { file_path: slash(deniedFile), content: 'must not exist' },
      },
    ],
  };
}
