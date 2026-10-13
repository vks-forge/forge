/**
 * Reading gate results together: latest row per gate, one summary, a failure text.
 *
 * Why: a verify cycle can leave several rows for the same gate (a gate that errored and
 *   was run again after a retry), and a merge must rest on the newest verdict of every
 *   gate that is configured, never on an old pass or on a gate that never ran. The summary
 *   is the only thing the merge decision reads: failures outrank errors, and anything but
 *   a full pass keeps the ticket from merging. The failure text is what the Worker is
 *   told on rework, so it names the gate, the check and, for a false claim, the claim.
 *
 * Exports: latestPerGate(), summarizeGates(), describeFailures().
 * Depends on: @forge/core (GateResult, GateVerdict), types/verify. No IO.
 */

import type { Gate, GateResult, GateVerdict } from '@forge/core';
import type { GateRows, GateSummary } from '#/types/verify.types.js';

const MAX_TEXT = 4_000;

/** The newest row (highest id) of each gate. */
export function latestPerGate(rows: readonly GateResult[]): GateRows {
  const latest = new Map<string, GateResult>();
  for (const r of rows) {
    const seen = latest.get(r.gate);
    if (!seen || r.id > seen.id) {
      latest.set(r.gate, r);
    }
  }

  return [...latest.values()];
}

/** Pass when every configured gate has a latest row that is passed or skipped. */
export function summarizeGates(rows: GateRows, gates: readonly Gate[]): GateSummary {
  const by = new Map(rows.map((r) => [r.gate, r]));
  const failed = gates.filter((g) => by.get(g.name)?.status === 'failed');
  if (failed.length > 0) {
    return { kind: 'fail', gates: failed.map((g) => g.name) };
  }

  const bad = gates.filter((g) => {
    const s = by.get(g.name)?.status;

    return s !== 'passed' && s !== 'skipped';
  });

  return bad.length > 0
    ? { kind: 'error', gates: bad.map((g) => g.name) }
    : { kind: 'pass' };
}

/** Findings of the failed gates as text for the next Worker prompt; falls back to report refs when verdicts are gone (after a restart). */
export function describeFailures(
  rows: GateRows,
  verdicts: ReadonlyMap<string, GateVerdict>,
): string {
  const lines: string[] = [];
  for (const row of rows.filter((r) => r.status === 'failed')) {
    const verdict = verdicts.get(row.gate);
    if (!verdict || verdict.findings.length === 0) {
      lines.push(`${row.gate} failed (report: ${row.report_ref ?? 'none'})`);
      continue;
    }

    for (const f of verdict.findings) {
      const claim = f.claim ? ` [claim: ${JSON.stringify(f.claim)}]` : '';
      lines.push(`${row.gate} ${f.check}: ${f.message}${claim}`);
    }
  }

  const text = lines.join('\n');

  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n...(truncated)` : text;
}
