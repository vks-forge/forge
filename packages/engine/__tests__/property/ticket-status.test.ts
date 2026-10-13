/**
 * Property: the engine changes ticket status only along paths `transition()` allows.
 *
 * Why: ticket status is the Director's source of truth and the one door for it is
 *   `transition()` (code.md rule 6): a status the state machine would refuse, written by a
 *   helper or a fast path, is how a ticket skips a gate or a sign-off. Two checks pin it.
 *   Dynamically, a storage spy records every compare-and-swap write while random sequences
 *   of requests, ticks, run endings, answers, cancels and clock jumps play out, and every
 *   status change must be reachable from the old status by legal events (the engine's
 *   multi-event moves walk several legal events in one write). Statically, the only file
 *   that writes ticket rows after intake is the ticket-moves door.
 *
 * Pins: no illegal status edge under random scenarios; tick reports carry no errors; only
 *   tick/ticket-moves.ts calls updateTicketCas and only tick/intake.ts inserts tickets.
 * Depends on: helpers/rig, @forge/core (transition), @forge/db, fast-check, vitest.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { transition } from '@forge/core';
import type {
  StorageAdapter,
  Ticket,
  TicketEvent,
  TicketStatus,
  TicketPatch,
} from '@forge/core';
import { createMemoryStorage } from '@forge/db';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRig } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';
import { makeResult } from '#tests/helpers/scripted-driver.js';

const AT = '2026-10-13T00:00:00.000Z';
const EVENTS: TicketEvent[] = [
  { type: 'triaged', lane: 'express', tier_predicted: 'A', at: AT },
  { type: 'dispatched', at: AT },
  { type: 'blocked', reason: 'r', at: AT },
  { type: 'unblocked', at: AT },
  { type: 'asked', at: AT },
  { type: 'answered', at: AT },
  { type: 'parked', reason: 'r', at: AT },
  { type: 'unparked', at: AT },
  { type: 'verifying', at: AT },
  { type: 'gate_failed', at: AT },
  { type: 'gate_passed', tier_actual: 'A', at: AT },
  { type: 'gate_passed', tier_actual: 'B', at: AT },
  { type: 'gate_passed', tier_actual: 'C', at: AT },
  { type: 'merged', at: AT },
  { type: 'done', signer: 's', at: AT },
  { type: 'cancelled', at: AT },
  { type: 'rework', at: AT },
];

const template = (status: TicketStatus): Ticket => ({
  id: 'FG-1' as Ticket['id'],
  project: 'forge',
  title: 't',
  body: 'b',
  type: 'fix',
  lane: 'express',
  tier_predicted: 'A',
  tier_actual: 'A',
  status,
  status_version: 1,
  rework_count: 0,
  created_at: AT,
  updated_at: AT,
  blocked_by: [],
});

/** Statuses reachable from `from` by up to three legal events, the longest chain the engine walks. */
function reachable(from: TicketStatus): Set<TicketStatus> {
  const seen = new Set<TicketStatus>([from]);
  let frontier = [from];
  for (let depth = 0; depth < 3; depth++) {
    const next: TicketStatus[] = [];
    for (const s of frontier) {
      for (const e of EVENTS) {
        const r = transition(template(s), e);
        if (r.ok && !seen.has(r.value.status)) {
          seen.add(r.value.status);
          next.push(r.value.status);
        }
      }
    }

    frontier = next;
  }

  return seen;
}

interface Write {
  from: TicketStatus | undefined;
  patch: TicketPatch;
}

/** Wraps storage so every ticket CAS write is recorded with the status it replaced. */
function spy(base: StorageAdapter, writes: Write[]): StorageAdapter {
  return {
    close: () => base.close(),
    transaction: (fn) =>
      base.transaction((tx) => {
        const tickets = new Proxy(tx.tickets, {
          get(target, prop) {
            if (prop === 'updateTicketCas') {
              return async (id: Ticket['id'], version: number, patch: TicketPatch) => {
                writes.push({ from: (await target.get(id))?.status, patch });

                return target.updateTicketCas(id, version, patch);
              };
            }

            const v: unknown = Reflect.get(target, prop);

            return typeof v === 'function'
              ? (v as (...a: unknown[]) => unknown).bind(target)
              : v;
          },
        });

        return fn(
          new Proxy(tx, {
            get: (t, p) => (p === 'tickets' ? tickets : Reflect.get(t, p)),
          }),
        );
      }),
  };
}

type Op =
  | { op: 'request' }
  | { op: 'tick' }
  | { op: 'advance'; ms: number }
  | { op: 'finish'; how: 'success' | 'paused' | 'rate_limit' | 'crash' | 'auth' }
  | { op: 'answer' }
  | { op: 'cancel'; n: number }
  | { op: 'standard' };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.constant<Op>({ op: 'request' }),
  fc.constant<Op>({ op: 'tick' }),
  fc.constant<Op>({ op: 'tick' }),
  fc
    .constantFrom(1_000, 11_000, 301_000, 3_700_000)
    .map((ms): Op => ({ op: 'advance', ms })),
  fc
    .constantFrom('success', 'paused', 'rate_limit', 'crash', 'auth')
    .map((how): Op => ({ op: 'finish', how })),
  fc.constant<Op>({ op: 'answer' }),
  fc.integer({ min: 1, max: 4 }).map((n): Op => ({ op: 'cancel', n })),
  fc.constant<Op>({ op: 'standard' }),
);

async function play(rig: Rig, ops: readonly Op[]): Promise<string[]> {
  const errors: string[] = [];
  const finished = new Set<string>();
  let pauses = 0;
  const tick = async (): Promise<void> => {
    const r = await rig.tick();
    errors.push(...r.errors.map((e) => `${e.where}: ${e.message}`));
  };

  for (const o of ops) {
    if (o.op === 'request') {
      await rig.request('Fix the doctor check');
    } else if (o.op === 'tick') {
      await tick();
    } else if (o.op === 'advance') {
      rig.clock.advance(o.ms);
    } else if (o.op === 'standard') {
      rig.llm.script('triage', {
        lane: 'standard',
        confidence: 0.9,
        predicted_files: [],
        questions: [],
        type: 'fix',
        tier_predicted: 'A',
        title: 'Heavier',
      });
    } else if (o.op === 'cancel') {
      await rig.engine.cancelTicket(`FG-${o.n}`);
    } else if (o.op === 'answer') {
      const pending = await rig.storage.transaction((tx) =>
        tx.interactions.listPending(),
      );

      if (pending[0]) {
        await rig.engine.answerInteraction(pending[0].id, 'yes');
      }
    } else {
      const runId = rig.engine.liveRunIds().find((id) => !finished.has(id));
      if (!runId) {
        continue;
      }

      finished.add(runId);
      const result =
        o.how === 'success'
          ? makeResult()
          : o.how === 'paused'
            ? makeResult({
                status: 'paused',
                pauseReason: 'interaction',
                interactionId: `int-p${++pauses}`,
              })
            : makeResult({ status: 'error', errorFamily: o.how });

      rig.driver.finish(runId, result);
      await rig.flush();
    }
  }

  await tick();

  return errors;
}

describe('ticket status writes', () => {
  it('only follow legal transitions under random scenarios', async () => {
    let checked = 0;
    await fc.assert(
      fc.asyncProperty(fc.array(opArb, { minLength: 1, maxLength: 14 }), async (ops) => {
        const writes: Write[] = [];
        const rig = await makeRig({ storage: spy(createMemoryStorage(), writes) });
        const errors = await play(rig, ops);

        expect(errors).toEqual([]);
        for (const w of writes) {
          const to = w.patch.status;
          if (to === undefined || w.from === undefined || to === w.from) {
            continue;
          }

          expect(reachable(w.from), `${w.from} -> ${to}`).toContain(to);
          checked++;
        }
      }),
      { numRuns: 40 },
    );

    // Guards against a spy that silently records nothing.
    expect(checked).toBeGreaterThan(20);
  }, 60_000);

  it('are made only by the ticket-moves door', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);

        return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
      });

    const src = join(import.meta.dirname, '..', '..', 'src');
    const files = walk(src).map((p) => ({
      p: p.replaceAll('\\', '/'),
      text: readFileSync(p, 'utf8'),
    }));

    const using = (needle: string) =>
      files
        .filter((f) => f.text.includes(needle))
        .map((f) => f.p.slice(f.p.indexOf('/src/') + 5));

    expect(using('updateTicketCas(')).toEqual(['tick/ticket-moves.ts']);
    expect(using('tickets.insert(')).toEqual(['tick/intake.ts']);
  });
});
