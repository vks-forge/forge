/**
 * Pins the committed tool catalogue against the live server.
 *
 * Why: the run's admission policy trusts `.forge/tools/catalog.yaml`. If it is not
 *   validly signed, every tool is quarantined; if a Forge tool's schema hash drifts from
 *   what the server actually exposes, the harness-side check would flag a tampered tool
 *   (or, worse, nobody would notice a schema widened without review). This test fails
 *   when either happens, and names the command that fixes it.
 *
 * Pins: .forge/tools/catalog.yaml, computeToolSchemaHashes(), DEV_CATALOGUE_KEY.
 * Depends on: @forge/tools, helpers/harness, domain/schema-hash, node:fs.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadCatalogue } from '@forge/tools';
import { describe, expect, it } from 'vitest';
import { DEV_CATALOGUE_KEY } from '#/domain/catalogue-key.js';
import { computeToolSchemaHashes } from '#/domain/schema-hash.js';

const FILE = resolve(import.meta.dirname, '../../../../.forge/tools/catalog.yaml');
const FORGE_TOOLS = [
  'add_comment',
  'ask_director',
  'docs_lookup',
  'finish',
  'get_ticket',
  'report_blocked',
  'web_fetch',
  'web_search',
].map((t) => `mcp__forge__${t}`);

describe('committed catalogue', () => {
  const state = loadCatalogue(readFileSync(FILE, 'utf8'), DEV_CATALOGUE_KEY, {
    allowDevKey: true,
  });

  it('verifies with the dev key', () => {
    expect(state.status).toBe('verified');
  });

  it('rejects a different key', () => {
    expect(
      loadCatalogue(readFileSync(FILE, 'utf8'), 'another-catalogue-key-0123456789abcdef')
        .status,
    ).toBe('quarantined');
  });

  it('lists the eight forge tools and the native tools', () => {
    if (state.status !== 'verified') throw new Error('not verified');
    for (const id of FORGE_TOOLS) expect(state.tools.has(id), id).toBe(true);
    for (const id of ['read', 'edit', 'write', 'glob', 'grep', 'shell', 'task'])
      expect(state.tools.has(id), id).toBe(true);
    expect(state.tools.get('mcp__forge__web_search')?.denies_native).toContain(
      'claude-code:WebSearch',
    );
    expect(state.tools.get('mcp__forge__web_fetch')?.denies_native).toContain(
      'claude-code:WebFetch',
    );
  });

  it('maps the shell tool to both Claude Code shell names (d-0048)', () => {
    if (state.status !== 'verified') throw new Error('not verified');
    const native = state.tools.get('shell')?.support['claude-code']?.native;
    expect(native).toEqual(['Bash', 'PowerShell']);
  });

  it('pins the schema hash the server really exposes (fix: node scripts/sign-catalogue.mjs)', async () => {
    if (state.status !== 'verified') throw new Error('not verified');
    const live = await computeToolSchemaHashes();
    expect(Object.keys(live).sort()).toEqual([...FORGE_TOOLS].sort());
    for (const [id, hash] of Object.entries(live)) {
      expect(state.tools.get(id)?.schema_hash, id).toBe(hash);
    }
  });

  it('declares risk per tool as the server reports it', async () => {
    if (state.status !== 'verified') throw new Error('not verified');
    expect(state.tools.get('mcp__forge__web_fetch')?.risk).toBe('network');
    expect(state.tools.get('mcp__forge__web_search')?.risk).toBe('network');
    expect(state.tools.get('mcp__forge__finish')?.risk).toBe('write-cwd');
    expect(state.tools.get('mcp__forge__docs_lookup')?.risk).toBe('read');
  });
});
