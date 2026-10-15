/**
 * Test fixtures for the G1 gate: real receipt chains, diffs and a gate context.
 *
 * Why: the gate's value is that it verifies genuine HMAC chains, so tests build receipts
 *   with the tools package's own `makeDecisionReceipt`/`makeEffectReceipt` instead of
 *   hand-writing rows that would pass a looser check than production.
 *
 * Exports: SECRET, RUN_ID, Segment, chain(), generationsChain(), diffOf(), context(), checksOf(),
 *   receiptLog().
 * Depends on: @forge/core, @forge/tools.
 */

import { ProjectConfig, Run, Ticket } from '@forge/core';
import type { Claim, GateContext, WorktreeDiff, WorktreeDiffFile } from '@forge/core';
import { makeDecisionReceipt, makeEffectReceipt, makeResumedReceipt } from '@forge/tools';
import type { EffectReceiptInput, Receipt, ReceiptLog } from '@forge/tools';

export const SECRET = 'run-secret-0123456789abcdef-0123456789';
export const RUN_ID = 'run-1';
const TS = '2026-01-01T00:00:00.000Z';
const HASH = 'a'.repeat(64);

type Call = {
  readonly id: string;
  readonly tool: string;
  readonly resource: string | null;
  readonly verdict?: 'allow' | 'deny';
  readonly state?: EffectReceiptInput['state'] | null;
};

/**
 * Builds a valid chain: for each call a decision and (unless `state: null`) an effect. With
 * `base` it continues that chain (same `seq` counter, linked to its last receipt) and returns
 * base plus the new receipts.
 */
export function chain(
  calls: readonly Call[],
  secret: string = SECRET,
  base: readonly Receipt[] = [],
): Receipt[] {
  const out: Receipt[] = [...base];
  let seq = base.filter((r) => r.kind === 'decision').length;
  for (const c of calls) {
    seq += 1;
    const decision = makeDecisionReceipt(
      {
        id: c.id,
        run_id: RUN_ID,
        seq,
        decision: {
          decision: c.verdict ?? 'allow',
          reason: 'allowed',
          enforced_by: 'forge_admit',
          enforcement: 'hook',
          layer: 'rule',
          matched_rule: null,
          finding_ids: [],
          tool: c.tool,
        },
        args_hash: HASH,
        resource: c.resource,
        ts: TS,
      },
      out.at(-1) ?? null,
      secret,
    );

    out.push(decision);
    if (c.state !== null && (c.verdict ?? 'allow') === 'allow') {
      out.push(
        makeEffectReceipt(
          decision,
          { state: c.state ?? 'mutation_committed', ts: TS },
          out.at(-1) ?? null,
          secret,
        ),
      );
    }
  }

  return out;
}

/** One secret generation's worth of calls, signed with that generation's secret. */
export type Segment = { readonly calls: readonly Call[]; readonly secret: string };

/** A chain of several secret generations joined by `resumed` receipts (d-0100). */
export function generationsChain(segments: readonly Segment[]): Receipt[] {
  let rows: Receipt[] = [];
  for (const [i, segment] of segments.entries()) {
    if (i > 0) {
      rows = [
        ...rows,
        makeResumedReceipt(
          { run_id: RUN_ID, generation: i + 1, ts: TS },
          rows.at(-1) ?? null,
          segment.secret,
        ),
      ];
    }

    rows = chain(segment.calls, segment.secret, rows);
  }

  return rows;
}

export function diffOf(
  files: readonly WorktreeDiffFile[],
  patch: string = '',
): WorktreeDiff {
  return { files, patch };
}

/** A minimal `git diff` patch for one file with the given added/removed lines. */
export function patchFor(
  path: string,
  added: readonly string[],
  removed: readonly string[] = [],
  deleted = false,
): string {
  return [
    `diff --git a/${path} b/${path}`,
    ...(deleted ? ['deleted file mode 100644'] : []),
    `--- a/${path}`,
    `+++ b/${path}`,
    '@@ -1,1 +1,1 @@',
    ...removed.map((l) => `-${l}`),
    ...added.map((l) => `+${l}`),
    '',
  ].join('\n');
}

/** Checks named after their role, in the order given: `checksOf({ lint: 'L', test: 'X' })`. */
export function checksOf(
  byRole: Partial<Record<ProjectConfig['checks'][number]['role'], string>>,
): ProjectConfig['checks'] {
  return Object.entries(byRole).map(([role, command]) => ({
    name: role,
    role: role as ProjectConfig['checks'][number]['role'],
    command,
  }));
}

export function context(
  overrides: {
    claims?: readonly Claim[];
    /** Run in list order. */
    checks?: ProjectConfig['checks'];
    ecosystems?: readonly string[];
    gateRules?: ProjectConfig['gate_rules'];
    worktreePath?: string;
    /** The run row's secret generation (default: absent, read as 1). */
    generation?: number;
  } = {},
): GateContext {
  return {
    ticket: Ticket.parse({
      id: 'FGE-1',
      project: 'forge',
      title: 't',
      body: '',
      type: 'feat',
      lane: 'express',
      tier_predicted: 'A',
      status: 'verifying',
      status_version: 1,
      rework_count: 0,
      priority: 0,
      created_at: TS,
      updated_at: TS,
      blocked_by: [],
    }),
    run: Run.parse({
      id: RUN_ID,
      ticket_id: 'FGE-1',
      harness: 'claude',
      driver_version: '1',
      cwd: overrides.worktreePath ?? '/wt',
      lane: 'express',
      started_at: TS,
      status: 'settled',
      owner: 'srv',
      ...(overrides.generation === undefined ? {} : { generation: overrides.generation }),
    }),
    project: ProjectConfig.parse({
      slug: 'forge',
      prefix: 'FGE',
      checks: overrides.checks ?? [],
      ecosystems: overrides.ecosystems ?? [],
      gate_rules: overrides.gateRules,
      default_harness: 'claude',
    }),
    worktreePath: overrides.worktreePath ?? '/wt',
    baseSha: 'base',
    claims: overrides.claims ?? [],
  };
}

/** In-memory `ReceiptLog` holding fixed receipts; `append` is unused by G1. */
export function receiptLog(receipts: readonly Receipt[]): ReceiptLog {
  return {
    append: () => Promise.reject(new Error('read-only fake')),
    list: () => Promise.resolve(receipts),
  };
}
