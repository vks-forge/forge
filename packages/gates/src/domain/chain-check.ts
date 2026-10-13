/**
 * Receipt chain check — is the evidence intact, and does it cover every tool call?
 *
 * Why: claims are only as good as the receipts they are matched against. A Worker (or a
 *   compromised harness) that could edit, drop or reorder receipts, or make tool calls
 *   that bypass the hook and so leave no receipt, could make any claim look supported.
 *   This check re-verifies the HMAC chain under the run secret, and requires that every
 *   tool call the harness reported has a decision receipt carrying the same id (the
 *   harness's tool-use id is the receipt id, d-0057). With no secret it cannot verify
 *   anything, so it reports `error`, never `passed`.
 *
 * Exports: checkChain().
 * Depends on: @forge/tools (verifyChain), types/check.types, types/g1-deps.types. No IO.
 */

import type { GateFinding } from '@forge/core';
import { verifyChain } from '@forge/tools';
import type { HmacKey, Receipt } from '@forge/tools';
import type { CheckOutcome } from '#/types/check.types.js';
import type { ToolCallRef } from '#/types/g1-deps.types.js';

function finding(message: string): GateFinding {
  return { check: 'chain', message };
}

/** Verifies the chain and that each tool call has a decision receipt with its id. */
export function checkChain(
  receipts: readonly Receipt[],
  toolCalls: readonly ToolCallRef[],
  secret: HmacKey | null,
): CheckOutcome {
  if (secret === null) {
    const message =
      'Run secret unavailable: the receipt chain cannot be verified, so this check did not run.';

    return { name: 'chain', status: 'error', findings: [], details: message };
  }

  const findings: GateFinding[] = [];
  let verified: ReturnType<typeof verifyChain>;
  try {
    verified = verifyChain(receipts, secret);
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

  const details =
    findings.length === 0
      ? `Chain of ${receipts.length} receipt(s) verified; ${toolCalls.length} tool call(s) all have receipts.`
      : findings.map((f) => `- ${f.message}`).join('\n');

  return {
    name: 'chain',
    status: findings.length === 0 ? 'passed' : 'failed',
    findings,
    details,
  };
}
