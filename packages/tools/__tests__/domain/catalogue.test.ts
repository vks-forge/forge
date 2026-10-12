/**
 * Pins catalogue loading: a catalogue is usable only if its HMAC verifies and it parses.
 *
 * Why: the signed catalogue is the root of trust for tool policy. If an edited, unsigned
 * or wrongly keyed catalogue could load, a Worker with write access to its checkout
 * could grant itself tools. A changed live schema hash must also kill trust in that one
 * tool (an MCP server that swaps a schema after review).
 *
 * Pins: loadCatalogue() verification and quarantine, signCatalogue(), schemaMatches().
 * Depends on: domain/catalogue, helpers/fixtures, yaml, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { loadCatalogue, schemaMatches, signCatalogue } from '#/domain/catalogue.js';
import { ENTRIES, KEY, liveHashes, signedYaml } from '#tests/helpers/fixtures.js';

describe('loadCatalogue', () => {
  it('loads a correctly signed catalogue and exposes its tools and hash', () => {
    const state = loadCatalogue(signedYaml(), KEY);
    expect(state.status).toBe('verified');
    if (state.status === 'verified') {
      expect(state.tools.get('shell')?.risk).toBe('exec');
      expect(state.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(state.tools.get('read')?.reaches_tools).toEqual([]);
    }
  });

  it('is independent of key order inside the file', () => {
    const reordered = ENTRIES.map((e) => Object.fromEntries(Object.entries(e).reverse()));
    const text = stringify({
      signature: signCatalogue(ENTRIES, KEY),
      entries: reordered,
    });
    expect(loadCatalogue(text, KEY).status).toBe('verified');
  });

  it('quarantines on the wrong key', () => {
    expect(loadCatalogue(signedYaml(), 'other-key')).toEqual({
      status: 'quarantined',
      reason: 'bad_signature',
    });
  });

  it('quarantines when any entry is edited after signing', () => {
    const sig = signCatalogue(ENTRIES, KEY);
    const edited = ENTRIES.map((e) => (e.id === 'shell' ? { ...e, risk: 'read' } : e));
    const text = stringify({ entries: edited, signature: sig });
    expect(loadCatalogue(text, KEY)).toEqual({
      status: 'quarantined',
      reason: 'bad_signature',
    });
  });

  it.each([
    ['not yaml', ': : :\n  - ['],
    ['scalar', '42'],
    ['no signature', stringify({ entries: ENTRIES })],
    ['no entries', stringify({ signature: 'a'.repeat(64) })],
  ])('quarantines malformed input (%s)', (_name, text) => {
    expect(loadCatalogue(text, KEY)).toEqual({
      status: 'quarantined',
      reason: 'malformed',
    });
  });

  it('quarantines a signed catalogue that violates the schema', () => {
    const bad = [{ id: 'Not A Valid Id', kind: 'harness-native' }];
    const text = stringify({ entries: bad, signature: signCatalogue(bad, KEY) });
    expect(loadCatalogue(text, KEY)).toEqual({
      status: 'quarantined',
      reason: 'malformed',
    });
  });

  it('quarantines duplicate tool ids even when signed', () => {
    const dup = [ENTRIES[0], ENTRIES[0]];
    const text = stringify({ entries: dup, signature: signCatalogue(dup, KEY) });
    expect(loadCatalogue(text, KEY)).toEqual({
      status: 'quarantined',
      reason: 'malformed',
    });
  });
});

describe('schemaMatches', () => {
  const state = loadCatalogue(signedYaml(), KEY);
  const def = state.status === 'verified' ? state.tools.get('read') : undefined;

  it('accepts the catalogue hash and rejects a changed or missing one', () => {
    if (!def) throw new Error('fixture');
    expect(schemaMatches(def, liveHashes())).toBe(true);
    expect(schemaMatches(def, { read: `sha256:${'0'.repeat(64)}` })).toBe(false);
    expect(schemaMatches(def, {})).toBe(false);
  });

  it('does not read inherited object properties', () => {
    if (!def) throw new Error('fixture');
    expect(schemaMatches({ ...def, id: 'toString' }, {})).toBe(false);
  });
});
