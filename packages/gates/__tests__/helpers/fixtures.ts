/**
 * Test fixtures for the G1 gate: real receipt chains, diffs and a gate context.
 *
 * Why: the gate's value is that it verifies genuine HMAC chains, so tests build receipts
 *   with the tools package's own `makeDecisionReceipt`/`makeEffectReceipt` instead of
 *   hand-writing rows that would pass a looser check than production.
 *
 * Exports: SECRET, RUN_ID, ChainBuilder, chain(), diffOf(), context(), receiptLog().
 * Depends on: @forge/core, @forge/tools.
 */

import { ProjectConfig, Run, Ticket } from '@forge/core';
import type { Claim, GateContext, WorktreeDiff, WorktreeDiffFile } from '@forge/core';
import { makeDecisionReceipt, makeEffectReceipt } from '@forge/tools';
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

/** Builds a valid chain: for each call a decision and (unless `state: null`) an effect. */
export function chain(calls: readonly Call[], secret: string = SECRET): Receipt[] {
  const out: Receipt[] = [];
  let seq = 0;
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

export function context(
  overrides: {
    claims?: readonly Claim[];
    commands?: ProjectConfig['commands'];
    profile?: 'ts' | 'generic';
    worktreePath?: string;
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
    }),
    project: ProjectConfig.parse({
      slug: 'forge',
      prefix: 'FGE',
      profile: overrides.profile ?? 'ts',
      commands: overrides.commands ?? {},
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
