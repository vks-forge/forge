/**
 * Builds the debug trace for this server: the no-op sink when off, files and redaction when on.
 *
 * Why: tracing is a debug switch (d-0163), so the server must be able to ask for "a trace" and
 *   get either something that costs nothing and creates nothing, or the whole pipeline: a
 *   writer on the trace folder, a redactor, and a sink that finds a ticket's or run's card by
 *   reading storage (cached). The literal secrets the redactor removes live in three places
 *   that only the app knows: the install token file, the SecretStore (GitHub keys, harness
 *   credentials, run secrets) and the values of the env-passthrough variables. The store's name
 *   list is read for every entry so a secret written a moment ago is covered at once (its value
 *   is fetched when the name is new, and all values again every few seconds), and a store that
 *   cannot be read costs only that net, never the trace. One start-up line says
 *   whether tracing is on and where it writes.
 *
 * Exports: createTrace().
 * Depends on: node:fs/promises, @forge/core, @forge/engine (Logger type), services/trace/{writer,
 *   redact,trace-sink}, types/{settings,trace}. IO: the install token file, SecretStore reads, storage reads.
 */

import { readFile } from 'node:fs/promises';
import { NOOP_TRACE } from '@forge/core';
import type { Clock, SecretStore } from '@forge/core';
import { createRedactor } from '#/services/trace/redact.js';
import { createTraceSink } from '#/services/trace/trace-sink.js';
import { createTraceWriter } from '#/services/trace/writer.js';
import type { CreateTraceOptions, Trace } from '#/types/trace.types.js';

const SECRET_TTL_MS = 5_000;
const MAX_SEEN = 500;

const NOT_TRACING: Trace = {
  sink: NOOP_TRACE,
  enabled: false,
  close: async () => undefined,
};

/** The SecretStore values seen so far, by name; new names are read at once, known ones again after a while. */
function createStoreReader(store: SecretStore, clock: Clock) {
  const seen = new Map<string, string>();
  let refreshedAt = Number.NEGATIVE_INFINITY;

  return async (): Promise<string[]> => {
    try {
      const names = await store.list('');
      const stale = clock.now() - refreshedAt > SECRET_TTL_MS;
      for (const name of names.filter((n) => stale || !seen.has(n))) {
        const bytes = await store.get(name);
        if (bytes) {
          seen.set(name, Buffer.from(bytes).toString('utf8').trim());
        }
      }

      refreshedAt = stale ? clock.now() : refreshedAt;
      // Values of deleted secrets (a finished run's) stay: they may still be in flight in an entry.
      while (seen.size > MAX_SEEN) {
        seen.delete(seen.keys().next().value as string);
      }
    } catch {
      // A store that cannot be read (DPAPI off Windows) must not stop the trace.
    }

    return [...seen.values()];
  };
}

/** Reads every literal secret the app knows of; each source that fails is skipped. */
async function readSecrets(
  opts: CreateTraceOptions,
  fromStore: () => Promise<string[]>,
): Promise<string[]> {
  const out: string[] = [];
  for (const name of opts.passthrough) {
    const value = opts.env[name];
    if (value) {
      out.push(value);
    }
  }

  try {
    out.push((await readFile(opts.installTokenPath, 'utf8')).trim());
  } catch {
    // No token file yet (or unreadable): the pattern and key nets still apply.
  }

  out.push(...(await fromStore()));

  return out.filter((s) => s !== '');
}

/** The trace for `opts.settings`; `enabled: false` (or no settings) means the no-op sink and no IO. */
export function createTrace(opts: CreateTraceOptions): Trace {
  const settings = opts.settings;
  if (!settings?.enabled) {
    opts.log('info', 'debug trace is off (set FORGE_TRACE=1 to write it)');

    return NOT_TRACING;
  }

  const writer = createTraceWriter({
    dir: settings.dir,
    keepDays: settings.keepDays,
    clock: opts.clock,
    stderr: opts.stderr,
  });

  const fromStore = createStoreReader(opts.secrets, opts.clock);
  // Read on every entry: the install token file and the store's name list are cheap, and a secret
  // written a moment ago must already be covered.
  const secretValues = (): Promise<readonly string[]> => readSecrets(opts, fromStore);

  const sink = createTraceSink({
    write: (entry, cardId) => writer.write(entry, cardId),
    redactor: createRedactor(),
    secretValues,
    now: () => opts.clock.now(),
    lookup: {
      cardOfTicket: (id) =>
        opts.storage.transaction(
          async (tx) => (await tx.tickets.get(id as never))?.card_id,
        ),
      ticketOfRun: (id) =>
        opts.storage.transaction(async (tx) => (await tx.runs.get(id))?.ticket_id),
    },
    stderr: opts.stderr,
  });

  writer.start();
  opts.log('info', `debug trace is on: writing to ${settings.dir}`, {
    dir: settings.dir,
    keepDays: settings.keepDays,
  });

  return { sink, enabled: true, close: () => writer.close() };
}
