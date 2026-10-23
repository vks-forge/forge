/**
 * The join between an `ask` and the engine's approval door.
 *
 * Why: the owner decides on what this builds: the exact call from the tokenised command (never
 * the Worker's own description), the key the answer rides on, the rule that asked and whether
 * "Always" is offered as which rule. A call with no key cannot be approved, so it must not reach
 * the engine at all, and a refusal by the engine must reach the hook as "not raised" so the call
 * is denied rather than left waiting.
 *
 * Pins: the request built for a protected-folder edit and for a shell install; the Worker
 * description passed only as `description`; no key means no raise; a refusal is null.
 * Depends on: src/services/approval-raiser, @forge/tools, @forge/db memory stores. No IO.
 */

import {
  createMemoryCatalogueStore,
  createMemoryConfigSource,
  createMemoryStorage,
} from '@forge/db';
import type { Run } from '@forge/core';
import type { ToolApprovalRequest, ToolApprovalResult } from '@forge/engine';
import { admit } from '@forge/tools';
import type { AdmitCall } from '@forge/tools';
import { describe, expect, it } from 'vitest';
import { createApprovalRaiser } from '#/services/approval-raiser.js';
import { createToolPolicy } from '#/services/tool-policy.js';
import type { HarnessCompat } from '#/types/harness-compat.types.js';

const HASH = `sha256:${'a'.repeat(64)}`;
const run = {
  id: 'run-1',
  ticket_id: 'FX-1',
  lane: 'standard',
  harness: 'claude-code',
  cwd: '/w',
  project: 'demo',
} as Run;

async function asked(call: AdmitCall, answer: ToolApprovalResult) {
  const storage = createMemoryStorage();
  // Approvals are only raised with Bypass permissions off (d-0183).
  await storage.transaction((tx) =>
    tx.harnesses.upsert({
      id: 'claude-code',
      kind: 'claude',
      auth_mode: 'login',
      status: 'ok',
      bypass_permissions: false,
    }),
  );

  for (const tool of ['write', 'shell']) {
    await storage.transaction((tx) =>
      tx.harnessToolSchemas.upsert({
        harness_kind: 'claude',
        version: '2.1.299',
        tool,
        schema_hash: HASH,
        status: 'approved',
      }),
    );
  }

  const policy = createToolPolicy({
    storage,
    catalogue: createMemoryCatalogueStore(),
    config: createMemoryConfigSource(),
    compat: { installedVersion: () => '2.1.299' } as unknown as HarnessCompat,
    dataHome: '/forge-home',
  });

  const ctx = await policy.admitContext(run);
  const decision = admit(ctx, call);
  const sent: ToolApprovalRequest[] = [];
  const raised = await createApprovalRaiser(async (r) => {
    sent.push(r);

    return answer;
  })({ run, ctx, call, decision, useId: 'tu-1' });

  return { decision, sent, raised };
}

const RAISED: ToolApprovalResult = {
  status: 'raised',
  interactionId: 'int-9',
  created: true,
};

describe('createApprovalRaiser', () => {
  it('describes an edit under a sensitive folder and offers that folder as the always rule', async () => {
    const { decision, sent, raised } = await asked(
      {
        phase: 'call',
        tool: 'write',
        input: {
          file_path: 'prisma/migrations/001/x.sql',
          content: 'x',
          description: 'add table',
        },
      },
      RAISED,
    );

    expect(decision.decision).toBe('ask');
    expect(raised).toEqual({ interaction_id: 'int-9' });
    expect(sent[0]).toMatchObject({
      runId: 'run-1',
      tool: 'write',
      action: 'write',
      what: 'write prisma/migrations/001/x.sql',
      reasonCode: decision.reason,
      callId: 'tu-1',
      description: 'add table',
      always: {
        offered: true,
        rule: { action: 'write', resource: 'prisma/migrations/**' },
      },
    });

    expect(sent[0]?.approvalKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it('says why Always is not offered for a protected path', async () => {
    const { decision, sent } = await asked(
      { phase: 'call', tool: 'write', input: { file_path: 'CLAUDE.md', content: 'x' } },
      RAISED,
    );

    expect(decision.decision).toBe('ask');
    expect(sent[0]?.always.offered).toBe(false);
  });

  it('does not raise a call that cannot be named, and a refusal is not a raise', async () => {
    const unnamed = await asked(
      { phase: 'call', tool: 'no_such_tool', input: {} },
      RAISED,
    );

    expect(unnamed.sent).toEqual([]);
    expect(unnamed.raised).toBeNull();

    const refused = await asked(
      {
        phase: 'call',
        tool: 'write',
        input: { file_path: 'migrations/1.sql', content: 'x' },
      },
      { status: 'refused', reason: 'express' },
    );

    expect(refused.sent).toHaveLength(1);
    expect(refused.raised).toBeNull();
  });
});
