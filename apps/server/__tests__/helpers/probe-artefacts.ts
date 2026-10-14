/**
 * Diagnosis and artefacts for the server's live probes.
 *
 * Why: a live probe costs minutes and a subscription's tokens, and its temp fixture is
 *   gone when the test ends. When a ticket parks (`waiting_human`, `blocked`, `cancelled`)
 *   the reader needs the reason at once: the blocked reason, how each run ended, the last
 *   events and which tool calls policy denied and why. This collects that from storage,
 *   writes everything worth keeping to `.forge/data/probes/<n>/` pass or fail, and turns a
 *   stopped ticket into one readable failure instead of a 15 minute wait. Secrets never
 *   reach the artefacts: the run's `hook.json` and `mcp.json` (bearer token) are skipped.
 *
 * Exports: collectDiagnosis(), describeStop(), writeArtefacts(), STOPPED_STATUSES, Diagnosis.
 * Depends on: node:fs, node:path, @forge/core (Run, RunEvent, Interaction, GateResult),
 *   @forge/tools (Receipt, DecisionReceipt), types/server. IO: reads storage, writes files.
 */

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TicketId } from '@forge/core';
import type { GateResult, Interaction, Run, RunEvent } from '@forge/core';
import type { DecisionReceipt, Receipt } from '@forge/tools';
import type { ForgeServer } from '#/types/server.types.js';

/** Ticket states in which nothing will advance without a human; a probe fails fast on them. */
export const STOPPED_STATUSES: readonly string[] = [
  'waiting_human',
  'blocked',
  'cancelled',
];

const RECENT_EVENTS = 30;
/** Files in a run directory that hold the run's bearer token. */
const SECRET_RUN_FILES = new Set(['hook.json', 'mcp.json']);

export interface RunDiagnosis {
  readonly run: Run;
  readonly events: RunEvent[];
  readonly receipts: readonly Receipt[];
}

export interface Diagnosis {
  readonly ticket: unknown;
  readonly runs: RunDiagnosis[];
  readonly gateResults: GateResult[];
  readonly interactions: Interaction[];
}

/** Reads the ticket, its runs, events, receipts, gate results and interactions in one pass. */
export async function collectDiagnosis(
  server: ForgeServer,
  ticketId: string,
): Promise<Diagnosis> {
  const stored = await server.storage.transaction(async (tx) => {
    const ticket = await tx.tickets.get(TicketId.parse(ticketId));
    const runs = await tx.runs.listByTicket(ticketId);
    const events = await Promise.all(runs.map((r) => tx.runEvents.listByRun(r.id)));

    return {
      ticket,
      runs,
      events,
      gateResults: await tx.gateResults.listByTicket(ticketId),
      interactions: await tx.interactions.listByTicket(ticketId),
    };
  });

  const receipts = await Promise.all(stored.runs.map((r) => server.receipts.list(r.id)));

  return {
    ticket: stored.ticket,
    runs: stored.runs.map((run, i) => ({
      run,
      events: stored.events[i] ?? [],
      receipts: receipts[i] ?? [],
    })),
    gateResults: stored.gateResults,
    interactions: stored.interactions,
  };
}

function isDenied(r: Receipt): r is DecisionReceipt {
  return r.kind === 'decision' && r.decision !== 'allow';
}

/** The failure message for a ticket that stopped: reason, every run's end, recent events, denials. */
export function describeStop(d: Diagnosis): string {
  const ticket = d.ticket as { status?: string; blocked_reason?: string } | null;
  const lines = [`ticket stopped in ${ticket?.status}: ${ticket?.blocked_reason}`];
  for (const { run, events, receipts } of d.runs) {
    const errors = events.flatMap((e) =>
      e.type === 'error' ? [`${e.family}: ${e.message}`] : [],
    );

    lines.push(
      `run ${run.id} status=${run.status} error_family=${run.error_family ?? '-'}`,
      ...errors.map((e) => `  error ${e}`),
      `  last ${RECENT_EVENTS} events:`,
      ...events
        .slice(-RECENT_EVENTS)
        .map((e) => `    ${JSON.stringify(e).slice(0, 400)}`),
      '  denied decisions:',
      ...receipts
        .filter(isDenied)
        .map(
          (r) =>
            `    ${r.tool} resource=${r.resource ?? '-'} layer=${r.layer} reason=${r.reason}`,
        ),
    );
  }

  return lines.join('\n');
}

function writeJson(dir: string, name: string, value: unknown): void {
  writeFileSync(join(dir, name), JSON.stringify(value, null, 2));
}

/** Writes everything worth keeping from a probe run; never throws, so it is safe in `finally`. */
export function writeArtefacts(
  out: string,
  dataHome: string,
  d: Diagnosis | null,
  serverLog: string,
): void {
  try {
    writeFileSync(join(out, 'server.log'), serverLog);
    if (!d) {
      return;
    }

    writeJson(out, 'ticket.json', { ticket: d.ticket, runs: d.runs.map((r) => r.run) });
    writeJson(out, 'gate-results.json', d.gateResults);
    writeJson(out, 'interactions.json', d.interactions);
    writeJson(
      out,
      'run-events.json',
      d.runs.map((r) => ({ run: r.run.id, events: r.events })),
    );

    writeJson(
      out,
      'receipts.json',
      d.runs.map((r) => ({ run: r.run.id, receipts: r.receipts })),
    );

    for (const { run } of d.runs) {
      const runDir = join(dataHome, 'runs', run.id);
      if (existsSync(runDir)) {
        // Includes the gate reports and any raw harness output the driver kept; the
        // token-bearing files are left out.
        const target = join(out, 'runs', run.id);
        mkdirSync(target, { recursive: true });
        cpSync(runDir, target, {
          recursive: true,
          filter: (src) => !SECRET_RUN_FILES.has(src.split(/[\\/]/).pop() ?? ''),
        });
      }
    }
  } catch (error) {
    process.stderr.write(`probe artefacts could not be written: ${String(error)}\n`);
  }
}
