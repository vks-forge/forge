/**
 * Command-line parsing for the `forge` CLI.
 *
 * Why: argv is untrusted input at the process boundary. Parsing it once with the standard
 *   `parseArgs` in strict mode turns a typo or an unknown flag into a usage error instead
 *   of a command that quietly does something else, and keeps `main.ts` free of logic.
 *
 * Exports: parseCommand(), USAGE.
 * Depends on: node:util, @forge/core (InvalidInputError), types/cli. No IO.
 */

import { parseArgs } from 'node:util';
import { InvalidInputError } from '@forge/core';
import type { Command } from '#/types/cli.types.js';

export const USAGE = `Usage:
  forge start                       run Forge in the background (prints its URL)
  forge status                      is Forge running; pid, port, uptime, version
  forge stop                        shut the background server down cleanly
  forge secret wrap <name> <file>   encrypt <file> with Windows DPAPI as secret <name>
  forge --help

\`start\` keeps the server running after this terminal closes; its log is
<dataHome>/logs/server.log. Run it from the Forge checkout (or set FORGE_ROOT).

Secrets are stored in the Forge data home, under secrets/<name>.dpapi
(%LOCALAPPDATA%\\Forge by default). The original file is never
modified or deleted; the command prints how to remove it once you have checked the result.
`;

/** Parses `argv` (without node and script). Throws InvalidInputError on anything unknown. */
export function parseCommand(argv: readonly string[]): Command {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: { help: { type: 'boolean', short: 'h' } },
    });
  } catch (cause) {
    throw new InvalidInputError((cause as Error).message, { cause });
  }

  const [group, action, name, file, ...extra] = parsed.positionals;
  if (parsed.values.help === true || group === undefined) {
    return { kind: 'help' };
  }

  if (group === 'start' || group === 'status' || group === 'stop') {
    if (action !== undefined) {
      throw new InvalidInputError(`usage: forge ${group}`);
    }

    return { kind: group };
  }

  if (group !== 'secret' || action !== 'wrap') {
    throw new InvalidInputError(`unknown command: ${parsed.positionals.join(' ')}`);
  }

  if (name === undefined || file === undefined || extra.length > 0) {
    throw new InvalidInputError('usage: forge secret wrap <name> <file>');
  }

  return { kind: 'secret-wrap', name, file };
}
