/**
 * Receipt chain check — is the evidence intact, and does it cover every tool call?
 *
 * Why: claims are only as good as the receipts they are matched against. A Worker (or a
 *   compromised harness) that could edit, drop or reorder receipts, or make tool calls
 *   that bypass the hook and so leave no receipt, could make any claim look supported.
 *   This check re-verifies the HMAC chain, and requires that every tool call the harness
 *   reported has a decision receipt carrying the same id (the harness's tool-use id is the
 *   receipt id, d-0057). A run that survived a server restart (d-0092) has one chain segment
 *   per secret generation, each signed with that generation's secret and joined to the one
 *   before by a `resumed` receipt (d-0100); every segment is verified with its own secret, the
 *   links are checked, and the number of generations must equal the run's, so a cut-out
 *   segment or a missing link fails the gate. With a secret missing for any generation it
 *   cannot verify anything, so it fails the gate, never passes it: the rework starts a fresh run.
 *
 * Exports: checkChain(), recordedGenerations().
 * Depends on: @forge/tools (verifyGenerations), types/check.types, types/g1-deps.types. No IO.
 */

import type { GateFinding } from '@forge/core';
import { verifyGenerations } from '@forge/tools';
import type { HmacKey, Receipt } from '@forge/tools';
import type { CheckOutcome } from '#/types/check.types.js';
import type { ToolCallRef } from '#/types/g1-deps.types.js';

function finding(message: string): GateFinding {
  return { check: 'chain', message };
}

/** A failed outcome with one finding; `failed` sends the ticket to rework instead of parking it. */
function failed(message: string): CheckOutcome {
  return {
    name: 'chain',
    status: 'failed',
    findings: [finding(message)],
    details: `- ${message}`,
  };
}

/** Generations the chain itself records: 1, plus one per `resumed` receipt. */
export function recordedGenerations(receipts: readonly Receipt[]): number {
  return 1 + receipts.filter((r) => r.kind === 'resumed').length;
}

/**
 * Verifies the chain and that each tool call has a decision receipt with its id.
 * `secrets` holds the secret of each generation that still has one; `runGeneration` is the
 * generation the run row says it reached (1 when it never resumed).
 */
export function checkChain(
  receipts: readonly Receipt[],
  toolCalls: readonly ToolCallRef[],
  secrets: ReadonlyMap<number, HmacKey>,
  runGeneration = 1,
): CheckOutcome {
  const expected = Math.max(runGeneration, recordedGenerations(receipts));
  for (let g = 1; g <= expected; g++) {
    if (!secrets.has(g)) {
      // `failed`, not `error`: an `error` would park the ticket, and unparking it would hit
      // the same missing secret forever; a failed gate sends the ticket to rework, which
      // starts a fresh run with a fresh secret.
      return failed(
        `Receipt chain unverifiable: the run secret of generation ${g} is gone; re-running the ticket.`,
      );
    }
  }

  const findings: GateFinding[] = [];
  let verified: ReturnType<typeof verifyGenerations>;
  try {
    verified = verifyGenerations(receipts, (g) => secrets.get(g) ?? null);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);

    return {
      name: 'chain',
      status: 'error',
      findings: [],
      details: `Receipt chain could not be verified: ${reason}`,
    };
  }

  if (!verified.ok) {
    const { index, reason } = verified.error;
    findings.push(finding(`Receipt chain broken at index ${index}: ${reason}.`));
  } else if (verified.value.generations !== runGeneration) {
    findings.push(
      finding(
        `Run reached generation ${runGeneration} but its receipt chain records ${verified.value.generations} (a resumed link is missing or extra).`,
      ),
    );
  }

  const decided = new Set<string>();
  for (const r of receipts) {
    if (r.kind === 'decision') {
      decided.add(r.id);
    }
  }

  for (const call of toolCalls) {
    if (!decided.has(call.callId)) {
      findings.push(
        finding(`Tool call "${call.name}" (${call.callId}) has no decision receipt.`),
      );
    }
  }

  const span =
    expected > 1
      ? `${receipts.length} receipt(s) across ${expected} generation(s)`
      : `${receipts.length} receipt(s)`;

  const details =
    findings.length === 0
      ? `Chain of ${span} verified; ${toolCalls.length} tool call(s) all have receipts.`
      : findings.map((f) => `- ${f.message}`).join('\n');

  return {
    name: 'chain',
    status: findings.length === 0 ? 'passed' : 'failed',
    findings,
    details,
  };
}
