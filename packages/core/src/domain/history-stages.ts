/**
 * History entries from reviews, check stages, sign-offs and gate results.
 *
 * Why: the owner's main "why" is what a reviewer or a check decided: "Sent back: zod is missing
 *   from package.json" says more than any status change. Stage runs carry that verdict and gate
 *   results carry the raw check outcome; both become one plain entry linking to the stage or run.
 *   Gate rows are shown only where no check stage already covers the same run.
 *
 * Exports: stageItems(), gateItems().
 * Depends on: domain/history-kit, schemas/stage-run, types/history. No IO.
 */

import { RANK, clip, linksOf, pushItem } from '#/domain/history-kit.js';
import type { HistoryActor, HistoryEntry } from '#/schemas/history.js';
import type { StageRun } from '#/schemas/stage-run.js';
import type { HistoryCtx } from '#/types/history.types.js';

function stageEntry(s: StageRun): HistoryEntry | undefined {
  const at = s.ended_at;
  if (at === undefined || s.status === 'running' || s.status === 'waiting') {
    return undefined;
  }

  const links = linksOf({ stage_id: s.stage_id, run_id: s.run_id });
  const o = s.outcome;
  const failed = s.status === 'failed' || s.status === 'error';
  const worker: HistoryActor = {
    type: 'worker',
    ...(s.agent_id === undefined ? {} : { name: s.agent_id }),
  };

  if (o.signed_by !== undefined) {
    return {
      at,
      kind: 'check',
      actor: { type: o.signed_by === 'owner' ? 'owner' : 'director' },
      title: o.signed_by === 'owner' ? 'You signed it off' : 'The Director signed it off',
      ...(o.sign_reason === undefined ? {} : { detail: o.sign_reason }),
      links,
    };
  }

  if (s.kind === 'agent' && o.review !== undefined) {
    const first = o.review.findings[0];

    return {
      at,
      kind: 'check',
      actor: worker,
      title:
        o.review.verdict === 'pass'
          ? 'Review passed'
          : `Sent back: ${clip(first?.issue ?? o.review.summary)}`,
      detail: o.review.summary,
      links,
    };
  }

  if (s.kind === 'script_gate') {
    return {
      at,
      kind: 'check',
      actor: { type: 'engine' },
      title: failed ? 'Checks failed' : 'Checks passed',
      ...(o.gate?.report_ref === undefined
        ? {}
        : { detail: `Report: ${o.gate.report_ref}` }),
      links,
    };
  }

  if (s.kind === 'director') {
    return {
      at,
      kind: 'check',
      actor: { type: 'director' },
      title: failed
        ? "The Director's check found a problem"
        : "The Director's check passed",
      ...(o.note === undefined ? {} : { detail: o.note }),
      links,
    };
  }

  if (!failed || s.kind === 'human') {
    return undefined;
  }

  return {
    at,
    kind: 'check',
    actor: worker,
    title: 'A step did not finish',
    ...(o.note === undefined ? {} : { detail: o.note }),
    links,
  };
}

/** Reviews, check stages and sign-offs that ended. */
export function stageItems(ctx: HistoryCtx): void {
  for (const s of ctx.facts.stageRuns) {
    const entry = stageEntry(s);
    if (entry !== undefined) {
      pushItem(ctx, RANK.check, entry);
    }
  }
}

/** Gate results of runs that no check stage already covers, one line per run. */
export function gateItems(ctx: HistoryCtx): void {
  const covered = new Set(
    ctx.facts.stageRuns.filter((s) => s.kind === 'script_gate').map((s) => s.run_id),
  );

  const byRun = new Map<string, HistoryCtx['facts']['gates'][number][]>();
  for (const g of ctx.facts.gates) {
    if (g.ended_at !== undefined) {
      byRun.set(g.run_id, [...(byRun.get(g.run_id) ?? []), g]);
    }
  }

  for (const [runId, rows] of byRun) {
    const at = rows
      .map((g) => g.ended_at ?? g.started_at)
      .sort()
      .at(-1);

    if (covered.has(runId) || at === undefined) {
      continue;
    }

    const bad = rows.filter((g) => g.status === 'failed' || g.status === 'error');
    pushItem(ctx, RANK.check, {
      at,
      kind: 'check',
      actor: { type: 'engine' },
      title:
        bad.length === 0
          ? 'Checks passed'
          : `Checks failed: ${bad.map((g) => g.gate).join(', ')}`,
      links: { run_id: runId },
    });
  }
}
