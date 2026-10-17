/**
 * The trace file writer: buffered, append-only JSON lines, one file per local day and per card.
 *
 * Why: the trace log (d-0163) must never slow or fail the engine, so entries are queued in
 *   memory and appended in batches about every 200 ms and at shutdown; a disk error warns
 *   once on stderr and the writer carries on. The combined file `forge-YYYY-MM-DD.jsonl`
 *   rolls over at local midnight (the day comes from each entry's own time), and an entry that
 *   belongs to a card also goes into `cards/<CARD-ID>.jsonl` so one card's story reads in one
 *   place. Card ids become file names only after unsafe characters are replaced, so a hostile
 *   id cannot leave the folder. Old files are removed by modification time at start and once a
 *   day, so a long-running dev server cannot fill the disk. Nothing is created until the first
 *   entry arrives.
 *
 * Exports: createTraceWriter(), dayFileName(), cardFileName().
 * Depends on: node:fs/promises, node:path, services/trace/truncate, types/trace. IO: the trace folder.
 */

import { appendFile, mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { TraceEntry } from '@forge/core';
import { fitEntry } from '#/services/trace/truncate.js';
import type { TraceWriter, TraceWriterOptions } from '#/types/trace.types.js';

const DAY_MS = 86_400_000;
const DEFAULT_FLUSH_MS = 200;
const DEFAULT_MAX_ENTRY_BYTES = 2 * 1024 * 1024;

const two = (n: number): string => String(n).padStart(2, '0');

/** `forge-YYYY-MM-DD.jsonl` for the server's local date of `ms`. */
export function dayFileName(ms: number): string {
  const d = new Date(ms);

  return `forge-${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}.jsonl`;
}

/** `<CARD-ID>.jsonl` with anything outside `[A-Za-z0-9._-]` replaced, never starting with a dot. */
export function cardFileName(cardId: string): string {
  const safe = cardId.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_');

  return `${safe === '' ? '_' : safe}.jsonl`;
}

/** Creates the writer; no file or folder exists until the first entry is flushed. */
export function createTraceWriter(opts: TraceWriterOptions): TraceWriter {
  const flushMs = opts.flushMs ?? DEFAULT_FLUSH_MS;
  const maxBytes = opts.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES;
  const cardsDir = join(opts.dir, 'cards');
  const pending = new Map<string, string[]>();
  const made = new Set<string>();
  let cancelFlush: (() => void) | null = null;
  let cancelPrune: (() => void) | null = null;
  let chain: Promise<void> = Promise.resolve();
  let warned = false;
  let closed = false;

  const warn = (what: string, error: unknown): void => {
    if (warned) {
      return;
    }

    warned = true;
    opts.stderr(
      `forge trace: could not ${what} (${error instanceof Error ? error.message : String(error)}); tracing continues without it\n`,
    );
  };

  async function drain(): Promise<void> {
    const batch = [...pending];
    pending.clear();
    for (const [path, lines] of batch) {
      try {
        const folder = join(path, '..');
        if (!made.has(folder)) {
          await mkdir(folder, { recursive: true });
          made.add(folder);
        }

        await appendFile(path, lines.join(''), 'utf8');
      } catch (error) {
        made.clear();
        warn('write the trace file', error);
      }
    }
  }

  const flush = (): Promise<void> => {
    cancelFlush?.();
    cancelFlush = null;
    chain = chain.then(drain, drain);

    return chain;
  };

  const queue = (path: string, line: string): void => {
    const lines = pending.get(path);
    if (lines) {
      lines.push(line);
    } else {
      pending.set(path, [line]);
    }
  };

  async function prune(): Promise<number> {
    const cutoff = opts.clock.now() - opts.keepDays * DAY_MS;
    let removed = 0;
    for (const folder of [opts.dir, cardsDir]) {
      let names: string[];
      try {
        names = await readdir(folder);
      } catch {
        continue;
      }

      for (const name of names.filter((n) => n.endsWith('.jsonl'))) {
        try {
          const path = join(folder, name);
          if ((await stat(path)).mtimeMs < cutoff) {
            await unlink(path);
            removed++;
          }
        } catch (error) {
          warn('prune an old trace file', error);
        }
      }
    }

    return removed;
  }

  const armPrune = (): void => {
    cancelPrune = opts.clock.after(DAY_MS, () => {
      void prune().finally(() => {
        if (!closed) {
          armPrune();
        }
      });
    });
  };

  return {
    write(entry: TraceEntry, cardId?: string): void {
      if (closed) {
        return;
      }

      try {
        const line = `${fitEntry(entry as unknown as Record<string, unknown>, maxBytes)}\n`;
        queue(join(opts.dir, dayFileName(Date.parse(entry.ts))), line);
        if (cardId) {
          queue(join(cardsDir, cardFileName(cardId)), line);
        }

        cancelFlush ??= opts.clock.after(flushMs, () => {
          cancelFlush = null;
          void flush();
        });
      } catch (error) {
        warn('queue a trace entry', error);
      }
    },
    start(): void {
      if (cancelPrune) {
        return;
      }

      void prune();
      armPrune();
    },
    flush,
    prune,
    async close(): Promise<void> {
      if (closed) {
        return;
      }

      await flush();
      closed = true;
      cancelPrune?.();
      cancelPrune = null;
    },
  };
}
