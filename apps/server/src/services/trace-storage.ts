/**
 * Storage that tells the trace what it wrote: every committed write becomes a trace entry.
 *
 * Why: card creation, chat turns, grill questions and answers, plans, ticket transitions,
 *   escalations, run rows and gate results all pass through the one storage port, so wrapping
 *   it records the whole story without edits scattered through the engine and the routes
 *   (d-0163). Like `tracked-storage`, it notes each write inside the transaction and acts only
 *   after the commit, so a rolled-back transaction leaves nothing. For a ticket move or an
 *   interaction update it first reads the row as it was, so the entry can say "inbox ->
 *   planned" rather than just "updated". The wrapper changes no result and no error. It is
 *   installed only when tracing is on; with it off, storage is not wrapped at all.
 *
 * Exports: traceStorageWrites().
 * Depends on: @forge/core (storage ports, TraceSink), services/trace/storage-rules,
 *   types/trace-storage. IO: one extra read before ticket and interaction writes.
 */

import type { StorageAdapter, StorageTx, TraceSink } from '@forge/core';
import { describeWrite, isWrite, needsBefore } from '#/services/trace/storage-rules.js';
import type { WriteCall } from '#/types/trace-storage.types.js';

type Repo = Record<string, (...args: unknown[]) => Promise<unknown>>;

/** The row as it was before a ticket or interaction write; never fails the write. */
async function readBefore(
  raw: StorageTx,
  repo: string,
  args: readonly unknown[],
): Promise<unknown> {
  const id = typeof args[0] === 'string' ? args[0] : undefined;
  if (id === undefined) {
    return undefined;
  }

  try {
    if (repo === 'tickets') {
      return await raw.tickets.get(id as never);
    }

    return repo === 'interactions' ? await raw.interactions.get(id) : undefined;
  } catch {
    return undefined;
  }
}

function watchRepo(
  name: string,
  repo: object,
  raw: StorageTx,
  calls: WriteCall[],
): object {
  return new Proxy(repo, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof prop !== 'string' || typeof value !== 'function' || !isWrite(name, prop)) {
        return value;
      }

      return async (...args: unknown[]) => {
        const before = needsBefore(name, prop) ? await readBefore(raw, name, args) : undefined;
        const result = await (value as Repo[string]).apply(target, args);
        calls.push({
          repo: name,
          method: prop,
          args,
          result,
          ...(before === undefined ? {} : { before }),
        });

        return result;
      };
    },
  });
}

function watchTx(raw: StorageTx, calls: WriteCall[]): StorageTx {
  return new Proxy(raw, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;

      return typeof prop === 'string' && value !== null && typeof value === 'object'
        ? watchRepo(prop, value, raw, calls)
        : value;
    },
  });
}

/** `storage` whose committed writes are emitted to `trace`; behaviour is otherwise unchanged. */
export function traceStorageWrites(
  storage: StorageAdapter,
  trace: TraceSink,
): StorageAdapter {
  return {
    close: () => storage.close(),
    async transaction(fn) {
      const calls: WriteCall[] = [];
      const out = await storage.transaction((tx) => fn(watchTx(tx, calls)));

      for (const call of calls) {
        try {
          const entry = describeWrite(call);
          if (entry) {
            trace.emit(entry);
          }
        } catch {
          // A trace problem must never fail a committed write.
        }
      }

      return out;
    },
  };
}
