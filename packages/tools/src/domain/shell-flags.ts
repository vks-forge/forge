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
 * Exports: MAX_DEPTH, Abort, bail(), baseName(), buildSegment().
 * Depends on: types/tokenizer.types. No IO.
 */

import type {
  ShellDialect,
  ShellFlag,
  ShellRedirect,
  ShellSegment,
  TokenizeFailure,
} from '#/types/tokenizer.types.js';

export const MAX_DEPTH = 4;
const INTERPRETERS = new Set([
  'bash',
  'sh',
  'zsh',
  'dash',
  'ksh',
  'fish',
  'python',
  'python3',
  'py',
  'node',
  'deno',
  'bun',
  'perl',
  'ruby',
  'php',
  'lua',
  'powershell',
  'pwsh',
  'cmd',
]);
const EVAL_ARGS = new Set([
  '-c',
  '-e',
  '-r',
  '-p',
  '--eval',
  '--command',
  '/c',
  '/k',
  '-command',
  '-encodedcommand',
  '-enc',
]);
const EVAL_BUILTINS = new Set(['eval', 'source', '.']);
const WRAPPERS = new Set([
  'env',
  'command',
  'builtin',
  'exec',
  'nohup',
  'time',
  'nice',
  'sudo',
  'doas',
  'xargs',
  'timeout',
  'setsid',
  'stdbuf',
  'start',
  'start-process',
  'invoke-command',
  'icm',
  'invoke-item',
]);
const DYNAMIC_PS = new Set(['invoke-expression', 'iex']);

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
  if (dialect === 'powershell' && DYNAMIC_PS.has(cmd)) bail('dynamic_execution');
  const evalArg = argv.slice(1).some((a) => EVAL_ARGS.has(a.toLowerCase()));
  if (EVAL_BUILTINS.has(cmd) || (INTERPRETERS.has(cmd) && evalArg))
    flags.push('interpreter_eval');
  if (WRAPPERS.has(cmd)) flags.push('wrapper');
  if (piped && INTERPRETERS.has(cmd)) flags.push('pipe_to_interpreter');
  return flags;
}

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

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
  if (extra) all.add(extra);
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
