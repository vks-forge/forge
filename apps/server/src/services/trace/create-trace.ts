/**
 * Builds the debug trace for this server: the no-op sink when off, files and redaction when on.
 *
 * Why: tracing is a debug switch (d-0163), so the server must be able to ask for "a trace" and
 *   get either something that costs nothing and creates nothing, or the whole pipeline: a
 *   writer on the trace folder, a redactor, and a sink that finds a ticket's or run's card by
 *   reading storage (cached). The literal secrets the redactor removes live in three places
 *   that only the app knows: the install token file, the SecretStore (GitHub keys, harness
 *   credentials, run secrets) and the values of the env-passthrough variables; they are read
 *   again at most every few seconds so a run secret created a moment ago is covered, and a
 *   store that cannot be read costs only that net, never the trace. One start-up line says
 *   whether tracing is on and where it writes.
 *
 * Exports: createTrace().
 * Depends on: node:fs/promises, @forge/core, @forge/engine (Logger type), services/trace/{writer,
 *   redact,trace-sink}, types/{settings,trace}. IO: the install token file, SecretStore reads, storage reads.
 */

import { readFile } from 'node:fs/promises';
import { NOOP_TRACE } from '@forge/core';
import type { Clock, SecretStore, StorageAdapter } from '@forge/core';
import type { Logger } from '@forge/engine';
import { createRedactor } from '#/services/trace/redact.js';
import { createTraceSink } from '#/services/trace/trace-sink.js';
import { createTraceWriter } from '#/services/trace/writer.js';
import type { TraceSettings } from '#/types/settings.types.js';
import type { Trace } from '#/types/trace.types.js';

const SECRET_TTL_MS = 5_000;

export interface CreateTraceOptions {
  readonly settings: TraceSettings | undefined;
  /** The unwrapped storage: used only to look up which card a ticket or run belongs to. */
  readonly storage: StorageAdapter;
  readonly secrets: SecretStore;
  readonly installTokenPath: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Names of env variables whose values reach harness children (`FORGE_HARNESS_ENV_PASSTHROUGH`). */
  readonly passthrough: readonly string[];
  readonly clock: Clock;
  readonly stderr: (text: string) => void;
  readonly log: Logger;
}

const NOT_TRACING: Trace = {
  sink: NOOP_TRACE,
  enabled: false,
  close: async () => undefined,
};

/** Reads every literal secret the app knows of; each source that fails is skipped. */
async function readSecrets(opts: CreateTraceOptions): Promise<string[]> {
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

  try {
    for (const name of await opts.secrets.list('')) {
      const bytes = await opts.secrets.get(name);
      if (bytes) {
        out.push(Buffer.from(bytes).toString('utf8').trim());
      }
    }
  } catch {
    // A store that cannot be read (DPAPI off Windows) must not stop the trace.
  }

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

  let cached: { at: number; values: string[] } | undefined;
  const secretValues = async (): Promise<readonly string[]> => {
    const now = opts.clock.now();
    if (!cached || now - cached.at > SECRET_TTL_MS) {
      cached = { at: now, values: await readSecrets(opts) };
    }

    return cached.values;
  };

  const sink = createTraceSink({
    write: (entry, cardId) => writer.write(entry, cardId),
    redactor: createRedactor(),
    secretValues,
    now: () => opts.clock.now(),
    lookup: {
      cardOfTicket: (id) =>
        opts.storage.transaction(async (tx) => (await tx.tickets.get(id as never))?.card_id),
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
