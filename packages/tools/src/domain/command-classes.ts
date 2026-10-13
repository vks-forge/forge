/**
 * Command classes — the one list of commands that run other commands.
 *
 * Why: a rule written for `pnpm test` or a floor written for `git push` is worthless if
 *   `env pnpm test`, `timeout 10 git push`, `bash -c "git push"` or `cmd /c git push` are
 *   judged by their first word. Three places need to agree on what delegates execution:
 *   the tokenizer flags it (so it needs a human), the argv floors look through it (so the
 *   floor still fires), and the grant builder refuses to remember an "always allow" for it.
 *   Keeping three private copies let them drift (a wrapper the flags knew but the floors
 *   did not was a floor bypass). This module is that single list (tool-system.md §5.2).
 *
 * Exports: INTERPRETERS, SHELL_INTERPRETERS, EVAL_FLAGS, EVAL_BUILTINS, WRAPPERS,
 *   LAUNCHER_PREFIXES, DYNAMIC_POWERSHELL, ALWAYS_ASK_COMMANDS, isEvalFlag(), isWrapper(), isInterpreter().
 * Depends on: No IO.
 */

/** Programs that execute a script or command string given as an argument. */
export const INTERPRETERS: ReadonlySet<string> = new Set([
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

/** Interpreters whose command string is shell text we can tokenise again. */
export const SHELL_INTERPRETERS: ReadonlySet<string> = new Set([
  'bash',
  'sh',
  'zsh',
  'dash',
  'ksh',
  'fish',
  'powershell',
  'pwsh',
  'cmd',
]);

/** Arguments that make an interpreter evaluate the next string (lower case). */
export const EVAL_FLAGS: ReadonlySet<string> = new Set([
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
  '-ec',
]);

/** Shell builtins that evaluate text or a file as code. */
export const EVAL_BUILTINS: ReadonlySet<string> = new Set(['eval', 'source', '.']);

/**
 * Commands that run the rest of their argv as a command, mapped to how many leading
 * positional arguments (a duration, a mask) they take before it. The floors scan every
 * later position, so an unknown option cannot hide the real command.
 */
export const WRAPPERS: ReadonlyMap<string, number> = new Map([
  ['env', 0],
  ['command', 0],
  ['builtin', 0],
  ['exec', 0],
  ['nohup', 0],
  ['time', 0],
  ['nice', 0],
  ['ionice', 0],
  ['chrt', 1],
  ['taskset', 1],
  ['sudo', 0],
  ['doas', 0],
  ['su', 0],
  ['xargs', 0],
  ['timeout', 1],
  ['setsid', 0],
  ['stdbuf', 0],
  ['unbuffer', 0],
  ['watch', 0],
  ['parallel', 0],
  ['busybox', 0],
  ['wsl', 0],
  ['start', 0],
  ['start-process', 0],
  ['invoke-command', 0],
  ['icm', 0],
  ['invoke-item', 0],
]);

/** Package-runner prefixes that fetch and run arbitrary code (checked as word prefixes). */
export const LAUNCHER_PREFIXES: readonly string[] = [
  'npx',
  'pnpm dlx',
  'pnpm exec',
  'yarn dlx',
  'bunx',
  'uvx',
  'pipx run',
];

/** PowerShell constructs that evaluate a string; the tokenizer refuses them outright. */
export const DYNAMIC_POWERSHELL: ReadonlySet<string> = new Set([
  'invoke-expression',
  'iex',
]);

/** Everything an "always allow" must never cover: interpreters, evaluators, wrappers, launchers. */
export const ALWAYS_ASK_COMMANDS: readonly string[] = [
  ...INTERPRETERS,
  ...EVAL_BUILTINS,
  ...DYNAMIC_POWERSHELL,
  ...WRAPPERS.keys(),
  ...LAUNCHER_PREFIXES,
];

/** True for an eval flag, including bundled short flags such as `-lc` and `-ec`. */
export function isEvalFlag(arg: string): boolean {
  const a = arg.toLowerCase();

  return EVAL_FLAGS.has(a) || /^-[a-z]*c[a-z]*$/.test(a);
}

export const isWrapper = (cmd: string): boolean => WRAPPERS.has(cmd);
export const isInterpreter = (cmd: string): boolean => INTERPRETERS.has(cmd);
