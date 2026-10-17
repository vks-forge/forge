/**
 * The trace sink: stamps, attributes to a card, redacts and hands entries to the writer.
 *
 * Why: every trace source (storage and Director decorators, the engine, HTTP) calls one
 *   `emit` that must be instant and unable to fail the caller (d-0163). Behind it, entries
 *   are processed strictly in emit order on one promise chain: a card id is found for entries
 *   that only know a ticket or a run (cached, since a ticket never changes card), the
 *   entry is redacted with the current secret values, and only then written. If redaction
 *   throws, the entry is dropped and stderr gets one warning that never repeats the content,
 *   because an unredacted entry must never reach a file.
 *
 * Exports: createTraceSink().
 * Depends on: @forge/core (TraceInput, TraceEntry, TraceSink), types/trace. IO: lookups through the injected port.
 */

import type { TraceEntry, TraceInput, TraceSink } from '@forge/core';
import type { TraceSinkOptions } from '#/types/trace.types.js';

/** Creates a sink writing through `opts.write`; `emit` never throws and never blocks. */
export function createTraceSink(opts: TraceSinkOptions): TraceSink {
  const cardByTicket = new Map<string, string>();
  const ticketByRun = new Map<string, string>();
  let seq = 0;
  let chain: Promise<void> = Promise.resolve();
  let warned = false;

  async function cached(
    cache: Map<string, string>,
    id: string,
    find: (id: string) => Promise<string | undefined>,
  ): Promise<string | undefined> {
    const known = cache.get(id);
    if (known !== undefined) {
      return known;
    }

    try {
      const found = await find(id);
      if (found !== undefined) {
        cache.set(id, found);
      }

      return found;
    } catch {
      return undefined;
    }
  }

  async function attribute(input: TraceInput): Promise<TraceInput> {
    let ticket = input.ticket_id;
    if (ticket === undefined && input.run_id !== undefined) {
      ticket = await cached(ticketByRun, input.run_id, opts.lookup.ticketOfRun);
    }

    let card = input.card_id;
    if (card === undefined && ticket !== undefined) {
      card = await cached(cardByTicket, ticket, opts.lookup.cardOfTicket);
    }

    return {
      ...input,
      ...(ticket === undefined ? {} : { ticket_id: ticket }),
      ...(card === undefined ? {} : { card_id: card }),
    };
  }

  async function handle(entry: TraceEntry, input: TraceInput): Promise<void> {
    try {
      const attributed = await attribute(input);
      const full: TraceEntry = { ...entry, ...attributed };
      const redacted = opts.redactor.redact(full, await opts.secretValues());

      opts.write(redacted, redacted.card_id);
    } catch {
      if (!warned) {
        warned = true;
        opts.stderr(
          'forge trace: an entry was dropped because it could not be redacted safely\n',
        );
      }
    }
  }

  return {
    emit(input: TraceInput): void {
      try {
        const entry = {
          ...input,
          ts: new Date(opts.now()).toISOString(),
          seq: ++seq,
        } as TraceEntry;

        chain = chain.then(() => handle(entry, input));
      } catch {
        // Tracing must never break the caller.
      }
    },
  };
}
