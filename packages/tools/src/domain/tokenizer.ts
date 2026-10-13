/**
 * Simple shell tokenizer for the Bash and PowerShell tools.
 *
 * Why: a Worker sends one string such as `pnpm test && git push` and policy must judge
 *   every command inside it, not the first word. Splitting on `;`, `&&`, `||`, `|`,
 *   newlines, `$(...)` and backticks, honouring quotes, lets each simple command be
 *   matched against rules on its own, and a chain is only as allowed as its worst
 *   segment. Anything this small parser cannot understand (heredocs, unbalanced quotes,
 *   process substitution, PowerShell call operators and `Invoke-Expression`) is refused
 *   rather than guessed at, because a wrong parse is a policy bypass. Tree-sitter would
 *   parse more, but is unverified on Windows (d-0038, d-0048).
 *
 * Exports: tokenizeShell().
 * Depends on: @forge/core (Result), domain/shell-flags, domain/shell-sequence,
 *   types/tokenizer.types. No IO.
 */

import { err, ok } from '@forge/core';
import type { Result } from '@forge/core';
import { Abort } from '#/domain/shell-flags.js';
import { parseSeq } from '#/domain/shell-sequence.js';
import type {
  ShellDialect,
  ShellSegment,
  TokenizeFailure,
} from '#/types/tokenizer.types.js';

/**
 * Splits `command` into simple-command segments. Returns `untokenizable` or
 * `dynamic_execution` on anything it cannot represent faithfully; callers must deny.
 */
export function tokenizeShell(
  command: string,
  dialect: ShellDialect,
): Result<ShellSegment[], TokenizeFailure> {
  const src = command.normalize('NFC');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(src)) {
    return err('untokenizable');
  }

  try {
    const { segments } = parseSeq(src, 0, dialect, 0, false);

    return segments.length === 0 ? err('untokenizable') : ok(segments);
  } catch (e) {
    return err(e instanceof Abort ? e.reason : 'untokenizable');
  }
}
