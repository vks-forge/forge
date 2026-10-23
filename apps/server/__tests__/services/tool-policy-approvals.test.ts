/**
 * The tool policy with the owner's answers: what a resumed Worker's repeated call is judged by.
 *
 * Why: a Standard Worker's call that hits `ask` is parked for the owner. When the owner has
 * answered, the repeated call must ride on exactly that answer and no more: allow once covers the
 * asking run and its resume only, deny refuses without asking again, and "always" is a rule stored
 * in the project's settings that the next ticket (and a later run) is judged by until the owner
 * revokes it by saving settings without it. Nothing may widen beyond the call the owner saw.
 *
 * Pins: admitContext() carries `approvals` from the answered permission items of the run and the
 *   run it resumes, not of another run; once / deny / always decisions through the real admit();
 *   a project approved rule applies to a new ticket and stops applying once revoked.
 * Depends on: src/services/tool-policy, @forge/db memory stores, @forge/tools. No IO.
 */

import {
  createMemoryCatalogueStore,
  createMemoryConfigSource,
  createMemoryStorage,
} from '@forge/db';
import type { ConfigSource, Run, StorageAdapter } from '@forge/core';
import { admit, approvalKey } from '@forge/tools';
import type { AdmitCall, CatalogueStore } from '@forge/tools';
import { beforeEach, describe, expect, it } from 'vitest';
import { createToolPolicy } from '#/services/tool-policy.js';
import type { HarnessCompat } from '#/types/harness-compat.types.js';

const HASH = `sha256:${'a'.repeat(64)}`;
const asking = {
  id: 'run-1',
  ticket_id: 'FX-1',
  lane: 'standard',
  harness: 'claude-code',
  cwd: '/w',
  project: 'demo',
} as Run;

const resumed = { ...asking, id: 'run-2', retry_of: 'run-1' } as Run;
const other = { ...asking, id: 'run-3' } as Run;

const call = (file: string): AdmitCall => ({
  phase: 'call',
  tool: 'write',
  input: { file_path: file, content: 'x' },
});

const MIGRATION = 'migrations/001_init.sql';

let storage: StorageAdapter;
let catalogue: CatalogueStore;
let config: ConfigSource;

const compat = { installedVersion: () => '2.1.299' } as unknown as HarnessCompat;
const policy = () =>
  createToolPolicy({ storage, catalogue, config, compat, dataHome: '/forge-home' });

async function judge(run: Run, file = MIGRATION) {
  const ctx = await policy().admitContext(run);

  return admit(ctx, call(file));
}

/** Records the owner's answer to the call `file` asked by run-1. */
async function answered(
  id: string,
  action: 'allow_once' | 'allow_always' | 'deny',
  file = MIGRATION,
  by = asking,
): Promise<void> {
  const key = approvalKey(await policy().admitContext(by), call(file));
  await storage.transaction(async (tx) => {
    await tx.interactions.insert({
      id,
      ticket_id: 'FX-1',
      run_id: 'run-1',
      kind: 'permission',
      payload: {
        kind: 'permission',
        tool: 'write',
        action: 'write',
        what: `write ${file}`,
        approval_key: key,
        reason_code: 'rule_ask',
        lane: 'standard',
        always: { offered: false, why: 'test' },
        summary: 'Waiting for your approval',
      },
      status: 'pending',
      asked_at: '2026-10-20T10:00:00.000Z',
      escalated_at: '2026-10-20T10:00:00.000Z',
      timeout_at: '9999-12-31T23:59:59.999Z',
    });

    await tx.interactions.answer(id, { action, by: 'owner' }, '2026-10-20T10:05:00.000Z');
  });
}

const saveApproved = (rules: unknown[], expectedVersion: number) =>
  config.append({
    scope: 'project',
    project: 'demo',
    doc: { tool_grants: { approved: rules } } as never,
    author: 'owner',
    reason: 'test',
    expectedVersion,
  });

beforeEach(async () => {
  storage = createMemoryStorage();
  catalogue = createMemoryCatalogueStore();
  config = createMemoryConfigSource();
  // These cases pin the owner's approvals, which only matter with Bypass permissions off (d-0183).
  await storage.transaction((tx) =>
    tx.harnesses.upsert({
      id: 'claude-code',
      kind: 'claude',
      auth_mode: 'login',
      status: 'ok',
      bypass_permissions: false,
    }),
  );

  await storage.transaction((tx) =>
    tx.harnessToolSchemas.upsert({
      harness_kind: 'claude',
      version: '2.1.299',
      tool: 'write',
      schema_hash: HASH,
      status: 'approved',
    }),
  );
});

describe('an unanswered call', () => {
  it('asks on Standard', async () => {
    expect(await judge(asking)).toMatchObject({ decision: 'ask', reason: 'rule_ask' });
  });
});

describe('allow once', () => {
  it('lets the repeated call through for the asking run and its resume, nobody else', async () => {
    await answered('int-1', 'allow_once');

    expect(await judge(asking)).toMatchObject({
      decision: 'allow',
      reason: 'approved_once',
      matched_rule: 'approval:int-1',
    });

    expect(await judge(resumed)).toMatchObject({
      decision: 'allow',
      reason: 'approved_once',
    });

    expect(await judge(other)).toMatchObject({ decision: 'ask' });
  });

  it('covers only the exact call the owner saw', async () => {
    await answered('int-1', 'allow_once');

    expect(await judge(resumed, 'migrations/002_other.sql')).toMatchObject({
      decision: 'ask',
    });
  });

  it('is not applied to Express', async () => {
    await answered('int-1', 'allow_once');

    expect(await judge({ ...resumed, lane: 'express' } as Run)).toMatchObject({
      decision: 'deny',
    });
  });
});

describe('deny', () => {
  it('refuses the repeated call without asking again', async () => {
    await answered('int-2', 'deny');

    expect(await judge(resumed)).toMatchObject({
      decision: 'deny',
      reason: 'approval_denied',
    });
  });
});

describe('an always rule in the project settings', () => {
  const rule = {
    id: 'approved-int-3',
    action: 'write',
    resource: 'migrations/**',
    effect: 'allow',
    created_at: '2026-10-20T10:00:00.000Z',
    source: { ticket_id: 'FX-1', interaction_id: 'int-3' },
  };

  it('allows a new ticket, then asks again once the owner revokes it', async () => {
    await saveApproved([rule], 0);

    expect(await judge(other)).toMatchObject({
      decision: 'allow',
      reason: 'approved_always',
    });

    await saveApproved([], 1);

    expect(await judge(other)).toMatchObject({ decision: 'ask' });
  });

  it('does not reach a protected path', async () => {
    await saveApproved([rule], 0);

    expect(await judge(other, '.git/config')).toMatchObject({ decision: 'deny' });
  });
});
