/**
 * The run's agent narrows the tool grant.
 *
 * Why: an agent promises what it may use and where it may write, and `admit()` keeps that promise
 *   from the grant the tool policy builds on every call. The layer is read from the run's agent id
 *   and the current settings, so narrowing an agent applies to the next call, a run that records no
 *   agent is judged exactly as before, a project may override only instructions and runs_on (never
 *   tools), and an agent the settings no longer list gets the narrowest layer instead of none.
 *
 * Pins: a tool list hides what it omits and keeps finish; a write scope denies edits outside it;
 *   older runs are unchanged; project overrides never touch tools; an unknown agent fails closed.
 * Depends on: src/services/tool-policy, @forge/db memory stores. No IO.
 */

import {
  createMemoryCatalogueStore,
  createMemoryConfigSource,
  createMemoryStorage,
} from '@forge/db';
import type { ConfigSource, Run, StorageAdapter } from '@forge/core';
import { admit } from '@forge/tools';
import type { CatalogueStore } from '@forge/tools';
import { beforeEach, describe, expect, it } from 'vitest';
import { createToolPolicy } from '#/services/tool-policy.js';
import type { HarnessCompat } from '#/types/harness-compat.types.js';

const HASH = `sha256:${'a'.repeat(64)}`;
const run = {
  lane: 'express',
  harness: 'claude-code',
  cwd: '/w',
  project: 'demo',
} as Run;

let storage: StorageAdapter;
let catalogue: CatalogueStore;
let config: ConfigSource;
let version: string | null;

const compat = { installedVersion: () => version } as unknown as HarnessCompat;
const policy = () =>
  createToolPolicy({ storage, catalogue, config, compat, dataHome: '/forge-home' });

const rowFor = (tool: string, status: 'approved' | 'pending' | 'denied', v = '2.1.299') =>
  storage.transaction((tx) =>
    tx.harnessToolSchemas.upsert({
      harness_kind: 'claude',
      version: v,
      tool,
      schema_hash: HASH,
      status,
    }),
  );

beforeEach(() => {
  storage = createMemoryStorage();
  catalogue = createMemoryCatalogueStore();
  config = createMemoryConfigSource();
  version = '2.1.299';
});

describe('the run agent narrows the grant', () => {
  const asAgent = { ...run, agent_id: 'implementer' } as Run;

  async function callAs(r: Run, tool: string, input: Record<string, unknown>) {
    return admit(await policy().admitContext(r), { phase: 'call', tool, input });
  }

  async function editImplementer(agent: Record<string, unknown>): Promise<void> {
    await config.append({
      scope: 'company',
      doc: { agents: { implementer: agent } },
      author: 'owner',
      reason: 'narrow the implementer',
      expectedVersion: 0,
    });
  }

  beforeEach(async () => {
    for (const tool of ['read', 'edit', 'write', 'grep']) {
      await rowFor(tool, 'approved');
    }
  });

  it('denies a tool the agent does not list and keeps the ones it does', async () => {
    await editImplementer({ tools: ['read', 'edit'] });

    expect(await callAs(asAgent, 'grep', { pattern: 'x' })).toMatchObject({
      decision: 'deny',
      reason: 'not_granted',
    });

    expect((await callAs(asAgent, 'read', { file_path: 'a.txt' })).decision).toBe(
      'allow',
    );

    expect((await callAs(asAgent, 'edit', { file_path: 'a.txt' })).decision).toBe(
      'allow',
    );
  });

  it('denies an edit outside the write scope and allows one inside it', async () => {
    await editImplementer({ write_scope: ['src/**'] });

    expect((await callAs(asAgent, 'edit', { file_path: 'src/a.ts' })).decision).toBe(
      'allow',
    );

    expect(await callAs(asAgent, 'edit', { file_path: 'docs/x.md' })).toMatchObject({
      decision: 'deny',
      reason: 'rule_deny',
    });
  });

  it('leaves a run that records no agent exactly as before', async () => {
    await editImplementer({ write_scope: ['src/**'] });

    expect((await callAs(run, 'edit', { file_path: 'docs/x.md' })).decision).toBe(
      'allow',
    );
  });

  it('applies a project override only to what a project may override, never to tools', async () => {
    await config.append({
      scope: 'project',
      project: 'demo',
      doc: { agents: { overrides: { implementer: { instructions: 'House style.' } } } },
      author: 'owner',
      reason: 'instructions only',
      expectedVersion: 0,
    });

    expect((await callAs(asAgent, 'edit', { file_path: 'docs/x.md' })).decision).toBe(
      'allow',
    );
  });

  it('gives a run whose agent is not listed the narrowest layer (fail closed)', async () => {
    const ghost = { ...run, agent_id: 'ghost-agent' } as Run;

    expect((await callAs(ghost, 'edit', { file_path: 'a.txt' })).decision).toBe('deny');
    expect((await callAs(ghost, 'mcp__forge__finish', {})).decision).not.toBe('deny');
  });
});
