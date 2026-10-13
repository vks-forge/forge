/**
 * Command candidates — every place a wrapped command could start inside one segment.
 *
 * Why: `sudo -u root git push`, `timeout 10 git push`, `xargs -n1 git push` and
 *   `nice -n 5 env FOO=1 git push` all run `git push`, but each wrapper has its own option
 *   syntax, and guessing which words are option values is how a floor gets dodged. Instead of
 *   parsing every wrapper, every later positional word of a wrapped segment is treated as a
 *   possible command start and judged on its own. That over-matches rarely (a `watch echo
 *   git push` is refused) and never under-matches, which is the right side to err on for a
 *   floor (tool-system.md §5.0).
 *
 * Exports: commandCandidates(), commandName(), ASSIGNMENT.
 * Depends on: domain/command-classes, domain/shell-flags. No IO.
 */

import { isWrapper } from '#/domain/command-classes.js';
import { baseName } from '#/domain/shell-flags.js';

export const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const MAX_CANDIDATES = 32;

/** Lower-case command name without directory or `.exe`. */
export const commandName = (word: string | undefined): string =>
  baseName(word ?? '', 'powershell');

/**
 * The argv slices that may be a real command: the segment itself, and, when it starts with
 * a wrapper, every later word that is neither an option nor an assignment.
 */
export function commandCandidates(argv: readonly string[]): string[][] {
  const out: string[][] = [[...argv]];
  if (!isWrapper(commandName(argv[0]))) return out;
  for (let i = 1; i < argv.length && out.length < MAX_CANDIDATES; i++) {
    const t = argv[i] ?? '';
    if (t.startsWith('-') || ASSIGNMENT.test(t)) continue;
    out.push(argv.slice(i));
  }
  return out;
}
