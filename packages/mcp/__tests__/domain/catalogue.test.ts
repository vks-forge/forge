/**
 * Pins the built-in tool catalogue against the live server.
 *
 * Why: the run's admission policy trusts the catalogue, whose first version is the built-in
 *   seed. If the seed does not load, every tool is quarantined; if a Forge tool's schema
 *   hash drifts from what the server actually exposes, the harness-side check would flag a
 *   tampered tool (or, worse, nobody would notice a schema widened without review). This
 *   test fails when either happens.
 *
 * Pins: BUILT_IN_CATALOGUE, computeToolSchemaHashes().
 * Depends on: @forge/tools, domain/schema-hash.
 */

import { BUILT_IN_CATALOGUE, loadCatalogue } from '@forge/tools';
import { describe, expect, it } from 'vitest';
import { computeToolSchemaHashes } from '#/domain/schema-hash.js';

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

describe('built-in catalogue', () => {
  const state = loadCatalogue(BUILT_IN_CATALOGUE);

  it('loads', () => {
    expect(state.status).toBe('verified');
  });

  it('lists the eight forge tools and the native tools', () => {
    if (state.status !== 'verified') {
      throw new Error('not verified');
    }

    for (const id of FORGE_TOOLS) {
      expect(state.tools.has(id), id).toBe(true);
    }

    for (const id of ['read', 'edit', 'write', 'glob', 'grep', 'shell', 'task']) {
      expect(state.tools.has(id), id).toBe(true);
    }

    expect(state.tools.get('mcp__forge__web_search')?.denies_native).toContain(
      'claude-code:WebSearch',
    );

    expect(state.tools.get('mcp__forge__web_fetch')?.denies_native).toContain(
      'claude-code:WebFetch',
    );
  });

  it('maps the shell tool to both Claude Code shell names (d-0048)', () => {
    if (state.status !== 'verified') {
      throw new Error('not verified');
    }

    const native = state.tools.get('shell')?.support['claude-code']?.native;
    expect(native).toEqual(['Bash', 'PowerShell']);
  });

  it('pins the schema hash the server really exposes', async () => {
    if (state.status !== 'verified') {
      throw new Error('not verified');
    }

    const live = await computeToolSchemaHashes();
    expect(Object.keys(live).sort()).toEqual([...FORGE_TOOLS].sort());
    for (const [id, hash] of Object.entries(live)) {
      expect(state.tools.get(id)?.schema_hash, id).toBe(hash);
    }
  });

  it('declares risk per tool as the server reports it', () => {
    if (state.status !== 'verified') {
      throw new Error('not verified');
    }

    expect(state.tools.get('mcp__forge__web_fetch')?.risk).toBe('network');
    expect(state.tools.get('mcp__forge__web_search')?.risk).toBe('network');
    expect(state.tools.get('mcp__forge__finish')?.risk).toBe('write-cwd');
    expect(state.tools.get('mcp__forge__docs_lookup')?.risk).toBe('read');
  });
});
