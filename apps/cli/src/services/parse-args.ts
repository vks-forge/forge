/**
 * Command-line parsing for the `forge` CLI.
 *
 * Why: argv is untrusted input at the process boundary. Parsing it once with the standard
 *   `parseArgs` in strict mode turns a typo or an unknown flag into a usage error instead
 *   of a command that quietly does something else, and keeps `main.ts` free of logic. The
 *   `memory` group takes a few options of its own (kinds, status, tags, a count, `--json`), and a memory
 *   option on any other command is refused rather than ignored.
 *
 * Exports: parseCommand(), USAGE.
 * Depends on: node:util, @forge/core (InvalidInputError, MemoryKind, MemoryStatus), types/cli. No IO.
 */

import { parseArgs } from 'node:util';
import { InvalidInputError, MemoryKind, MemoryStatus } from '@forge/core';
import type { Command } from '#/types/cli.types.js';

export const USAGE = `Usage:
  forge start [--no-open]           run Forge in the background and open it in the browser
  forge open [--no-open]            print (and open) a fresh one-time sign-in link
  forge status                      is Forge running; pid, port, uptime, version
  forge stop                        shut the background server down cleanly
  forge secret wrap <name> <file>   encrypt <file> with Windows DPAPI as secret <name>
  forge memory search <words...>    find records in this repository's .forge/memory by their words
        [--kind decision,rejected] [--status active] [--tag t] [-k 8] [--json] [--all] [--dir <folder>]
  forge memory get <id...>          print records with their provenance [--full] [--json] [--dir <folder>]
  forge memory related <id>         records linked to or like one [--json] [--dir <folder>]
  forge --help

\`start\` keeps the server running after this terminal closes; its log is
<dataHome>/logs/server.log. Run it from the Forge checkout (or set FORGE_ROOT).

Secrets are stored in the Forge data home, under secrets/<name>.dpapi
(%LOCALAPPDATA%\\Forge by default). The original file is never
modified or deleted; the command prints how to remove it once you have checked the result.

\`memory\` reads the markdown records of this repository (the first .forge/memory above the current folder,
else FORGE_ROOT) through a local index kept in .forge/memory/.index, rebuilt when a record changes. It never
needs the server and writes nothing outside .index. \`--all\` also searches proposals, outcomes and superseded
records.
`;

const MEMORY_ONLY = ['kind', 'status', 'tag', 'k', 'json', 'all', 'full', 'dir'] as const;

function words<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  what: string,
): T[] | undefined {
  if (raw === undefined) {
    return undefined;
  }

  return raw.split(',').map((w) => {
    const word = w.trim();
    if (!(allowed as readonly string[]).includes(word)) {
      throw new InvalidInputError(
        `--${what} must be one of ${allowed.join(', ')}; got "${word}"`,
      );
    }

    return word as T;
  });
}

function count(raw: string | undefined): number {
  const n = raw === undefined ? 8 : Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 25) {
    throw new InvalidInputError('-k must be a whole number from 1 to 25');
  }

  return n;
}

/** Parses `argv` (without node and script). Throws InvalidInputError on anything unknown. */
export function parseCommand(argv: readonly string[]): Command {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        'no-open': { type: 'boolean' },
        kind: { type: 'string' },
        status: { type: 'string' },
        tag: { type: 'string', multiple: true },
        k: { type: 'string', short: 'k' },
        json: { type: 'boolean' },
        all: { type: 'boolean' },
        full: { type: 'boolean' },
        dir: { type: 'string' },
      },
    });
  } catch (cause) {
    throw new InvalidInputError((cause as Error).message, { cause });
  }

  const [group, action, name, file, ...extra] = parsed.positionals;
  if (parsed.values.help === true || group === undefined) {
    return { kind: 'help' };
  }

  if (group !== 'memory') {
    const used = MEMORY_ONLY.find((o) => parsed.values[o] !== undefined);
    if (used !== undefined) {
      throw new InvalidInputError(`--${used} belongs to \`forge memory\``);
    }
  }

  const noOpen = parsed.values['no-open'] === true;
  if (group === 'start' || group === 'open') {
    if (action !== undefined) {
      throw new InvalidInputError(`usage: forge ${group} [--no-open]`);
    }

    return { kind: group, open: !noOpen };
  }

  if (group === 'status' || group === 'stop') {
    if (action !== undefined || noOpen) {
      throw new InvalidInputError(`usage: forge ${group}`);
    }

    return { kind: group };
  }

  if (group === 'memory') {
    const v = parsed.values;
    const base = { json: v.json === true, dir: v.dir };
    const rest = parsed.positionals.slice(2);
    if (action === 'search' && rest.length > 0) {
      return {
        kind: 'memory-search',
        words: rest,
        kinds: words(v.kind, MemoryKind.options, 'kind'),
        status: words(v.status, MemoryStatus.options, 'status'),
        tags: v.tag ?? [],
        k: count(v.k),
        all: v.all === true,
        ...base,
      };
    }

    if (action === 'get' && rest.length > 0) {
      return { kind: 'memory-get', ids: rest, full: v.full === true, ...base };
    }

    if (action === 'related' && rest.length === 1) {
      return { kind: 'memory-related', id: rest[0] as string, ...base };
    }

    throw new InvalidInputError(
      'usage: forge memory search <words...> | get <id...> | related <id>',
    );
  }

  if (group !== 'secret' || action !== 'wrap') {
    throw new InvalidInputError(`unknown command: ${parsed.positionals.join(' ')}`);
  }

  if (name === undefined || file === undefined || extra.length > 0) {
    throw new InvalidInputError('usage: forge secret wrap <name> <file>');
  }

  return { kind: 'secret-wrap', name, file };
}
