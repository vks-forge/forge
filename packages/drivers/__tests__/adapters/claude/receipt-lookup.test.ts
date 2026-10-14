/**
 * Pins: how the driver reads back the verdict the hook route already signed.
 *
 * Why: the driver's permission handler and receipt cross-check trust only the decision
 * receipt the server wrote, so reading it back must be exact: by the harness tool-use id
 * first (d-0057), by the args hash when ids differ, and a receipt that cannot be read as a
 * valid decision must read as a deny, never an allow.
 *
 * Depends on: src/adapters/claude/receipt-lookup, @forge/tools (receipt builders). No IO.
 */

import { makeDecisionReceipt } from '@forge/tools';
import type { Decision, Receipt, ReceiptLog } from '@forge/tools';
import { describe, expect, it } from 'vitest';
import { createReceiptLookup } from '#/adapters/claude/receipt-lookup.js';

const SECRET = 'x'.repeat(40);
const decision: Decision = {
  decision: 'allow',
  reason: 'rule_allow',
  enforced_by: 'forge_admit',
  enforcement: 'hook',
  layer: 'rule',
  matched_rule: 'lane:express#1',
  finding_ids: [],
  tool: 'shell',
};

function logWith(reason: Decision['reason'] = 'rule_allow'): ReceiptLog {
  const receipt: Receipt = makeDecisionReceipt(
    {
      id: 'toolu_1',
      run_id: 'run-1',
      seq: 1,
      decision: { ...decision, reason },
      version: '1',
      schema_hash: null,
      args_hash: 'ab'.repeat(32),
      resource: 'npm test',
      approver: 'auto',
      ts: '2026-10-13T00:00:00.000Z',
    },
    null,
    SECRET,
  );

  return {
    list: async (runId: string) => (runId === 'run-1' ? [receipt] : []),
  } as unknown as ReceiptLog;
}

describe('createReceiptLookup', () => {
  it('finds the decision by tool-use id', async () => {
    const found = await createReceiptLookup(logWith()).decisionFor('run-1', 'toolu_1');

    expect(found).toMatchObject({
      decision: 'allow',
      tool: 'shell',
      matched_rule: 'lane:express#1',
    });
  });

  it('falls back to the args hash when ids differ', async () => {
    const lookup = createReceiptLookup(logWith());

    expect(
      await lookup.decisionFor('run-1', 'other', {
        name: 'Bash',
        argsHash: 'ab'.repeat(32),
      }),
    ).toMatchObject({ decision: 'allow' });

    expect(
      await lookup.decisionFor('run-1', 'other', {
        name: 'Bash',
        argsHash: 'cd'.repeat(32),
      }),
    ).toBeNull();
  });

  it('returns null for a call with no receipt and for another run', async () => {
    const lookup = createReceiptLookup(logWith());

    expect(await lookup.decisionFor('run-1', 'toolu_404')).toBeNull();
    expect(await lookup.decisionFor('run-2', 'toolu_1')).toBeNull();
  });

  it('reads a receipt it cannot interpret as a deny', async () => {
    const lookup = createReceiptLookup(logWith('made_up_reason' as Decision['reason']));

    expect(await lookup.decisionFor('run-1', 'toolu_1')).toMatchObject({
      decision: 'deny',
      reason: 'fail_closed_internal',
    });
  });
});
