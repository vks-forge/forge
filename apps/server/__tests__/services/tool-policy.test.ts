/**
 * The tool policy: native tools are trusted only through approved schemas of the installed build.
 *
 * Why: Claude Code reports no schema for its built-in tools, so Forge fingerprints them per
 * build (d-0088) and the owner approves each new or changed shape. If a pending tool were
 * admitted, a harness upgrade that changed a tool's input would pass unnoticed; if an
 * approved one were refused, Workers could not read a file. The policy also has to follow
 * edits made while the server runs (an approval, a new catalogue version) and apply the
 * project's own grant, which used to be dropped on the floor.
 *
 * Pins: an approved row admits `read`; a pending, denied, unknown-build or unapproved tool
 *   is denied with `schema_pending` / `schema_denied`; an approval applies to the next call;
 *   the catalogue hash follows the approvals; a project grant narrows tools; Forge MCP tools
 *   stay hashed live; a broken catalogue is refused.
 * Depends on: src/services/tool-policy, @forge/db memory stores. No IO.
 */

import {
  createMemoryCatalogueStore,
  createMemoryConfigSource,
  createMemoryStorage,
} from '@forge/db';
import type { ConfigSource, Run, StorageAdapter } from '@forge/core';
import { BUILT_IN_CATALOGUE, admit } from '@forge/tools';
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

async function readCall(
  tool = 'read',
  input: Record<string, unknown> = { file_path: 'a.txt' },
) {
  const ctx = await policy().admitContext(run);

  return admit(ctx, { phase: 'call', tool, input });
}

beforeEach(() => {
  storage = createMemoryStorage();
  catalogue = createMemoryCatalogueStore();
  config = createMemoryConfigSource();
  version = '2.1.299';
});

describe('toolCatalogued', () => {
  it('is true for a tool the healthy catalogue lists and false for an unknown one', async () => {
    const p = policy();

    expect(await p.toolCatalogued('read')).toBe(true);
    expect(await p.toolCatalogued('no_such_tool')).toBe(false);
  });
});

describe('native schema approvals', () => {
  it('admits read once its schema is approved for the installed build', async () => {
    await rowFor('read', 'approved');

    expect((await readCall()).decision).toBe('allow');
  });

  it('denies a pending tool as schema_pending', async () => {
    await rowFor('read', 'pending');

    expect(await readCall()).toMatchObject({
      decision: 'deny',
      reason: 'schema_pending',
    });
  });

  it('denies a denied tool as schema_denied', async () => {
    await rowFor('read', 'denied');

    expect(await readCall()).toMatchObject({ decision: 'deny', reason: 'schema_denied' });
  });

  it('denies every native tool of a build with no rows, and when no build is known', async () => {
    expect(await readCall()).toMatchObject({ reason: 'schema_pending' });
    version = null;
    await rowFor('read', 'approved');

    expect(await readCall()).toMatchObject({
      decision: 'deny',
      reason: 'schema_pending',
    });
  });

  it('does not borrow another build approval', async () => {
    await rowFor('read', 'approved', '2.1.293');

    expect(await readCall()).toMatchObject({ reason: 'schema_pending' });
  });

  it('applies an approval to the next call without a restart', async () => {
    const p = policy();
    await rowFor('read', 'pending');
    const before = admit(await p.admitContext(run), {
      phase: 'call',
      tool: 'read',
      input: { file_path: 'a.txt' },
    });

    await rowFor('read', 'approved');
    const after = admit(await p.admitContext(run), {
      phase: 'call',
      tool: 'read',
      input: { file_path: 'a.txt' },
    });

    expect([before.decision, after.decision]).toEqual(['deny', 'allow']);
  });

  it('changes the catalogue hash when an approval changes', async () => {
    const p = policy();
    const none = await p.catalogueHash();
    await rowFor('read', 'approved');
    const some = await p.catalogueHash();

    expect(none).toMatch(/^[0-9a-f]{64}$/);
    expect(some).not.toBe(none);
  });
});

describe('Forge MCP tools and the catalogue', () => {
  it('still hashes the Forge MCP tools live whatever the build', async () => {
    version = '0.0.1';
    const ctx = await policy().admitContext(run);

    expect(Object.keys(ctx.liveSchemaHashes)).toContain('mcp__forge__finish');
    expect(Object.keys(ctx.liveSchemaHashes)).not.toContain('read');
  });

  it('follows a new catalogue version', async () => {
    await rowFor('read', 'approved');
    const doc = {
      entries: BUILT_IN_CATALOGUE.entries.filter((e) => e.id !== 'read'),
    };

    await catalogue.append({
      doc,
      author: 'owner',
      reason: 'drop read',
      expectedVersion: 1,
    });

    expect(await readCall()).toMatchObject({ decision: 'deny', reason: 'unknown_tool' });
  });
});

describe('a catalogue that does not load', () => {
  it('is refused with a pointer to the fix instead of running with no policy', async () => {
    catalogue = {
      current: async () => ({
        version: 3,
        doc: { entries: [] },
        author: 'x',
        reason: 'y',
        created_at: 0,
      }),
      history: async () => [],
      append: async () => {
        throw new Error('unused');
      },
    };

    await expect(policy().catalogueHash()).rejects.toThrow(/does not load/);
  });
});

describe('project tool grants', () => {
  it('narrows the lane with the project grant from its settings', async () => {
    await rowFor('read', 'approved');
    await rowFor('grep', 'approved');
    await config.append({
      scope: 'project',
      project: 'demo',
      doc: { tool_grants: { deny: ['grep'] } },
      author: 'owner',
      reason: 'no grep',
      expectedVersion: 0,
    });

    expect((await readCall()).decision).toBe('allow');
    expect(await readCall('grep', { pattern: 'x' })).toMatchObject({
      decision: 'deny',
      reason: 'not_granted',
    });
  });

  it('applies no project grant when the run has no project', async () => {
    await rowFor('grep', 'approved');
    const ctx = await policy().admitContext({ ...run, project: undefined } as Run);

    expect(
      admit(ctx, { phase: 'call', tool: 'grep', input: { pattern: 'x' } }).decision,
    ).toBe('allow');
  });
});
