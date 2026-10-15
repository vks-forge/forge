/**
 * Shell segment classification — which commands need a human however they are spelled.
 *
 * Why: a rule that matches `pnpm test` is worthless if `env pnpm test`, `bash -c "..."`
 *   or `curl x | sh` are judged by their first word. This module names the constructs
 *   that hide or delegate execution (wrappers, interpreter eval, piping into an
 *   interpreter, PowerShell `Invoke-Expression`) and builds the final segment record, so
 *   the tokenizer only has to split text and the rule engine only has to read flags
 *   (tool-system.md §5.2, d-0048).
 *
 * Exports: MAX_DEPTH, Abort, bail(), baseName(), buildSegment(), startsExpansion(), expandsHere().
 * Depends on: domain/command-classes, types/tokenizer.types. No IO.
 */

import {
  DYNAMIC_POWERSHELL,
  EVAL_BUILTINS,
  INTERPRETERS,
  isEvalFlag,
  isWrapper,
} from '#/domain/command-classes.js';
import type {
  ShellDialect,
  ShellFlag,
  ShellRedirect,
  ShellSegment,
  TokenizeFailure,
} from '#/types/tokenizer.types.js';

export const MAX_DEPTH = 4;

/** Internal control flow; never escapes `tokenizeShell`. */
export class Abort extends Error {
  readonly reason: TokenizeFailure;
  constructor(reason: TokenizeFailure) {
    super(reason);
    this.reason = reason;
  }
}

export const bail = (reason: TokenizeFailure = 'untokenizable'): never => {
  throw new Abort(reason);
};

export function baseName(cmd: string, dialect: ShellDialect): string {
  const rooted = cmd.startsWith('/') || /^[A-Za-z]:[\\/]/.test(cmd);
  const bare = rooted ? (cmd.split(/[\\/]/).pop() ?? cmd) : cmd;
  const noExe = bare.replace(/\.exe$/i, '');

  return dialect === 'powershell' ? noExe.toLowerCase() : noExe;
}

function classify(
  argv: readonly string[],
  dialect: ShellDialect,
  piped: boolean,
): ShellFlag[] {
  const flags: ShellFlag[] = [];
  const cmd = baseName(argv[0] ?? '', dialect).toLowerCase();
  if (dialect === 'powershell' && DYNAMIC_POWERSHELL.has(cmd)) {
    bail('dynamic_execution');
  }

  const evalArg = argv.slice(1).some(isEvalFlag);
  if (EVAL_BUILTINS.has(cmd) || (INTERPRETERS.has(cmd) && evalArg)) {
    flags.push('interpreter_eval');
  }

  if (isWrapper(cmd)) {
    flags.push('wrapper');
  }

  if (piped && INTERPRETERS.has(cmd)) {
    flags.push('pipe_to_interpreter');
  }

  return flags;
}

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/**
 * True when `src[i]` is a `$` that the shell would expand: `$NAME`, `${...}` or PowerShell
 * `$env:X`. The text stays literal in our argv (`$LOCALAPPDATA/Forge/x` would resolve inside
 * the worktree), so the floors cannot judge it and the segment must go to a human. `$null`
 * is PowerShell's constant and is harmless; `$?`, `$1` and friends name no file.
 */
export function startsExpansion(src: string, i: number, ps: boolean): boolean {
  if (src[i] !== '$' || !/[A-Za-z_{]/.test(src[i + 1] ?? '')) {
    return false;
  }

  return !(ps && /^\$null(?![A-Za-z0-9_:])/i.test(src.slice(i, i + 6)));
}

/** `~user` at the start of a bash word expands to another user's home directory. */
const startsTildeUser = (src: string, i: number): boolean =>
  src[i] === '~' && /[A-Za-z_]/.test(src[i + 1] ?? '');

/** True when the unquoted character at `i` begins something the shell would expand. */
export const expandsHere = (
  src: string,
  i: number,
  ps: boolean,
  atWordStart: boolean,
): boolean =>
  startsExpansion(src, i, ps) || (!ps && atWordStart && startsTildeUser(src, i));

/** Builds one segment: strips leading `NAME=value` words (bash), classifies, derives match texts. */
export function buildSegment(
  words: readonly string[],
  redirects: readonly ShellRedirect[],
  flags: ReadonlySet<ShellFlag>,
  piped: boolean,
  dialect: ShellDialect,
  extra?: ShellFlag,
): ShellSegment {
  const args = [...words];
  const assignments: string[] = [];
  while (dialect === 'bash' && args.length > 0 && ASSIGNMENT.test(args[0] ?? '')) {
    assignments.push(args.shift() as string);
  }

  const all = new Set<ShellFlag>([...flags, ...classify(args, dialect, piped)]);
  if (extra) {
    all.add(extra);
  }

  const head = args[0] === undefined ? '' : baseName(args[0], dialect);

  return {
    argv: args,
    text: args.join(' '),
    baseText: [head, ...args.slice(1)].join(' '),
    assignments,
    redirects: [...redirects],
    flags: [...all],
    nested: false,
  };
}
