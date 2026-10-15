/**
 * Environment floor — a Worker command never reads the process environment or a provider drive.
 *
 * Why: Forge hands the harness its credentials (`ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`)
 *   through environment variables. `Get-ChildItem Env:`, `printenv`, `echo $env:KEY` or
 *   `cat /proc/self/environ` print them into the Worker's transcript, and from there they
 *   leave Forge. File floors do not see this: `Env:` is a PowerShell provider drive, not a
 *   file. Such a read is a managed deny in every lane, whether it comes by command name
 *   (`printenv`, bare `env`, `export -p`), by drive (`env:`, `variable:`, `HKLM:`), by
 *   expansion (`$env:X`, `${env:X}`), by provider-qualified path (`Environment::`) or by the .NET API. `env pnpm test` (a wrapper) is not
 *   a dump and stays allowed.
 *
 * Exports: envViolation().
 * Depends on: domain/command-candidates, types/tokenizer. No IO.
 */

import {
  ASSIGNMENT,
  commandCandidates,
  commandName,
} from '#/domain/command-candidates.js';
import type { ShellSegment } from '#/types/tokenizer.types.js';

const RULE = 'floor:argv:env-read';

/** PowerShell provider drives that expose credentials or system state, at the start of a value. */
const PROVIDER_DRIVE =
  /(?:^|[=:,'"(])(?:env|variable|function|alias|cert|hk(?:lm|cu)|wsman):/i;

/**
 * The provider-qualified spelling, `Environment::NAME` or `Microsoft.PowerShell.Core\Registry::HKLM`,
 * reaches the same providers without a drive letter. `FileSystem::` is included because it
 * names any file path, the data home among them, past the path floors.
 */
const PROVIDER_QUALIFIED =
  /(?:^|[=:,'"(])(?:[a-z0-9.]+[\\/])?(?:environment|variable|function|alias|certificate|registry|wsman|filesystem)::/i;

const PROC_ENVIRON = /^\/proc\/(?:self|thread-self|\d+)(?:\/task\/\d+)?\/environ$/i;
const TEXT_FORMS = [
  /\$\{?env:/i,
  /\[(?:system\.)?environment\]/i,
  /\bGetEnvironmentVariables?\b/i,
  /\/proc\/(?:self|thread-self|\d+)(?:\/task\/\d+)?\/environ/i,
];

const DUMP_COMMANDS = new Set(['printenv', 'get-variable', 'gv']);

/** `set NAME` with no `=`: not an option, not the option name after bash's `-o`/`+o`. */
function listsByPrefix(args: readonly string[]): boolean {
  return args.some(
    (a, i) => !/^[-+/]/.test(a) && !a.includes('=') && !/^[-+]o$/.test(args[i - 1] ?? ''),
  );
}

function dumpsEnvironment(cmd: string, args: readonly string[]): boolean {
  if (DUMP_COMMANDS.has(cmd)) {
    return true;
  }

  // cmd's `set PREFIX` lists the variables starting with PREFIX; an assignment has `=`, an option a dash or slash.
  if (cmd === 'set' && listsByPrefix(args)) {
    return true;
  }

  // `env`, `set`, `export` with nothing to run or assign print every variable.
  if (cmd === 'env' || cmd === 'set' || cmd === 'export') {
    const rest = args.filter((a) => !(cmd === 'env' && a.startsWith('-')));

    return cmd === 'env'
      ? rest.every((a) => ASSIGNMENT.test(a))
      : args.length === 0 || (cmd === 'export' && args.some((a) => /^-[a-z]*p/i.test(a)));
  }

  if (cmd === 'declare' || cmd === 'typeset') {
    return args.some((a) => /^-[a-zA-Z]*[xp]/.test(a));
  }

  if (cmd === 'compgen') {
    return args.some((a) => /^-[a-zA-Z]*[ev]/.test(a));
  }

  return false;
}

/** A rule id when the segment reads the environment or a credential-bearing provider drive. */
export function envViolation(seg: ShellSegment): string | null {
  if (TEXT_FORMS.some((re) => re.test(seg.text))) {
    return RULE;
  }

  for (const argv of commandCandidates(seg.argv)) {
    const cmd = commandName(argv[0]);
    const args = argv.slice(1);
    if (dumpsEnvironment(cmd, args)) {
      return RULE;
    }

    if (
      args.some(
        (a) =>
          PROVIDER_DRIVE.test(a) || PROVIDER_QUALIFIED.test(a) || PROC_ENVIRON.test(a),
      )
    ) {
      return RULE;
    }
  }

  return null;
}
