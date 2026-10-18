/**
 * Runs the `forge memory search | get | related` commands over a local index of this repository's memory.
 *
 * Why: a session should read the few records that matter, not every file of `.forge/memory`. These commands
 *   ask the same index the product uses (the search code is shared, not copied), over a local copy built from
 *   the markdown records, so the answers are the ones a Worker or the Director would get. They never need the
 *   server and write nothing outside the local index. A search that finds nothing is an answer, not an error
 *   (exit 0); an id that does not exist is an error (exit 1) naming the id. `--json` prints the reply as
 *   data for a program to read.
 *
 * Exports: runMemoryCommand().
 * Depends on: @forge/core (types, MemoryKind, MemoryStatus), services/memory-dir, services/memory-format,
 *   types/cli, types/daemon (Output). IO: through the ports and the output sinks.
 */

import { MemoryKind, MemoryStatus } from '@forge/core';
import { findMemoryDir } from '#/services/memory-dir.js';
import { hitLine, recordText, relatedLine } from '#/services/memory-format.js';
import type { MemoryCliPorts, MemoryCommand } from '#/types/cli.types.js';
import type { Output } from '#/types/daemon.types.js';

/** The slug of this repository's memory inside its local index. */
const PROJECT = 'forge';

/** Executes one memory command and returns the process exit code. */
export async function runMemoryCommand(
  command: MemoryCommand,
  ports: MemoryCliPorts,
  out: Output,
): Promise<number> {
  const dir = await findMemoryDir(ports, command.dir);
  const opened = await ports.openIndex(dir);
  if (opened.rebuilt) {
    out.stderr('forge: memory index rebuilt from the markdown records\n');
  }

  try {
    if (command.kind === 'memory-search') {
      const reply = await opened.index.search({
        project: PROJECT,
        actor: 'cli',
        text: command.words.join(' '),
        k: command.k,
        ...(command.all
          ? { kinds: [...MemoryKind.options], status: [...MemoryStatus.options] }
          : {
              ...(command.kinds === undefined ? {} : { kinds: [...command.kinds] }),
              ...(command.status === undefined ? {} : { status: [...command.status] }),
            }),
        ...(command.tags.length > 0 ? { tags: [...command.tags] } : {}),
      });

      if (command.json) {
        out.stdout(`${JSON.stringify(reply, null, 2)}\n`);
      } else if (reply.hits.length === 0) {
        out.stdout('no matches\n');
      } else {
        out.stdout(`${reply.hits.map(hitLine).join('\n')}\n`);
        if (reply.truncated) {
          out.stdout(`showing ${reply.hits.length} of ${reply.total}; use -k for more\n`);
        }
      }

      return 0;
    }

    if (command.kind === 'memory-get') {
      const { records, missing } = await opened.index.get(PROJECT, command.ids, {
        actor: 'cli',
        full: command.full,
      });

      out.stdout(
        command.json
          ? `${JSON.stringify({ records, missing }, null, 2)}\n`
          : records.map(recordText).join('\n'),
      );

      for (const id of missing) {
        out.stderr(`${id}: not found\n`);
      }

      return missing.length > 0 ? 1 : 0;
    }

    const related = await opened.index.related(PROJECT, command.id, 5, { actor: 'cli' });
    if (related === null) {
      out.stderr(`${command.id}: not found\n`);

      return 1;
    }

    out.stdout(
      command.json
        ? `${JSON.stringify({ related }, null, 2)}\n`
        : related.length === 0
          ? 'nothing related\n'
          : `${related.map(relatedLine).join('\n')}\n`,
    );

    return 0;
  } finally {
    await opened.close();
  }
}
