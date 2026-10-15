/**
 * Argv data-home floor — the data-home check over every word of a command line.
 *
 * Why: `git diff`, `git commit`, `git add` and `pnpm test` are allowed in every lane, and each
 *   can open a file named on its command line (`git commit -F <file>`, `git diff -- <file>`).
 *   If the data-home floor only looked at known reader commands, a Worker could print Forge's
 *   install token or database through them. The floor therefore cannot depend on knowing the
 *   command: it looks at every word, at the value of `--flag=value` and at a value glued to a
 *   short flag (`-F<path>`), exactly as it looks at a path tool's argument.
 *
 * Exports: argvDataHomeOutcome().
 * Depends on: domain/data-home-floor, types/rules. No IO.
 */

import { dataHomeOutcome } from '#/domain/data-home-floor.js';
import type { RuleOutcome } from '#/types/rules.types.js';

/**
 * The data-home floor over every word of an argv, whatever the command: the word itself, the
 * value of `--flag=value`, and the value glued to a short flag (`-F<path>`). Commands that
 * the allow-list lets through in every lane (`git diff`, `git commit`, `pnpm test`) can open a
 * file named on their command line, so the floor cannot depend on knowing the command. A word
 * that is not a path resolves inside the worktree and is ignored.
 */
export function argvDataHomeOutcome(
  dataHome: string,
  argv: readonly string[],
  cwd: string | undefined,
): RuleOutcome | null {
  for (const word of argv) {
    const eq = word.indexOf('=');
    const forms = [
      word,
      eq >= 0 ? word.slice(eq + 1) : '',
      /^-[^-]/.test(word) ? word.slice(2) : '',
    ];

    for (const form of forms) {
      const hit = form === '' ? null : dataHomeOutcome(dataHome, form, cwd);
      if (hit !== null) {
        return hit;
      }
    }
  }

  return null;
}
