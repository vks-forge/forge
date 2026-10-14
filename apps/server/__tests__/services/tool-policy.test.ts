/**
 * The native tool schema pin: trusted only on the harness build that was reviewed.
 *
 * Why: Claude Code does not report its native tool schemas, so the catalogue's pin for
 * `read`, `shell` and friends has nothing live to be compared with. If the server fed the
 * catalogue's own hash back as the "live" hash, a harness upgrade that changed a tool's
 * input shape would pass unnoticed. The pin therefore counts only while the build the
 * driver reports is the build the catalogue says was reviewed (d-0053); on any other build
 * the native hashes are absent and admit() denies the tools as `schema_changed` until
 * someone re-probes and re-signs.
 *
 * Pins: matching version admits `read`; mismatched or unknown version denies it as
 *   `schema_changed` with a "not reviewed" log; Forge MCP tools stay hashed live.
 * Depends on: src/services/tool-policy, the repo's signed catalogue. IO: reads the catalogue.
 */

import { fileURLToPath } from 'node:url';
import type { Run } from '@forge/core';
import { DEV_CATALOGUE_KEY, admit } from '@forge/tools';
import { describe, expect, it, vi } from 'vitest';
import { loadToolPolicy } from '#/services/tool-policy.js';
import type { ServerSettings } from '#/types/settings.types.js';

const CATALOGUE = fileURLToPath(
  new URL('../../../../.forge/tools/catalog.yaml', import.meta.url),
);

const settings = {
  layout: { cataloguePath: CATALOGUE },
  catalogueKey: DEV_CATALOGUE_KEY,
  allowDevCatalogueKey: true,
} as unknown as ServerSettings;

const run = { lane: 'express', harness: 'claude-code', cwd: '/w' } as Run;

async function decide(version: string | null, log = vi.fn()) {
  const policy = await loadToolPolicy(settings, { id: 'claude-code', version }, log);
  const ctx = await policy.admitContext(run);

  return {
    log,
    read: admit(ctx, { phase: 'call', tool: 'read', input: { file_path: 'a.txt' } }),
  };
}

describe('native schema pin', () => {
  it('admits read on the reviewed harness version', async () => {
    const { read, log } = await decide('2.1.293');

    expect(read.decision).toBe('allow');
    expect(log).not.toHaveBeenCalledWith('warn', expect.any(String), expect.anything());
  });

  it('denies read as schema_changed on another harness version and says how to fix it', async () => {
    const { read, log } = await decide('2.1.296');

    expect(read).toMatchObject({ decision: 'deny', reason: 'schema_changed' });
    expect(log).toHaveBeenCalledWith(
      'warn',
      expect.stringMatching(
        /harness version 2\.1\.296 not reviewed.*re-probe and re-sign.*d-0053/,
      ),
      expect.objectContaining({ denied: expect.arrayContaining(['read', 'shell']) }),
    );
  });

  it('denies native tools when the driver reports no version', async () => {
    const { read, log } = await decide(null);

    expect(read).toMatchObject({ decision: 'deny', reason: 'schema_changed' });
    expect(log).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('harness version unknown'),
      expect.anything(),
    );
  });

  it('still hashes the Forge MCP tools live whatever the harness version', async () => {
    const policy = await loadToolPolicy(settings, {
      id: 'claude-code',
      version: '0.0.1',
    });

    const ctx = await policy.admitContext(run);

    expect(Object.keys(ctx.liveSchemaHashes)).toContain('mcp__forge__finish');
    expect(Object.keys(ctx.liveSchemaHashes)).not.toContain('read');
  });
});
