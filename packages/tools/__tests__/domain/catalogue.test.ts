/**
 * Pins catalogue loading, the per-build native schema rows, the built-in seed and schemaMatches().
 *
 * Why: whether a tool exists for a run is decided here. A catalogue that does not parse, has
 * a duplicate id or lacks a hash on a tool Forge vouches for must quarantine whole, never
 * load partly. A native tool is trusted only through an approved row for the installed
 * harness build, so a new build or a changed schema has to surface as `pending`, and the
 * catalogue hash a run records has to change with the hashes it was allowed (d-0088). The
 * built-in seed is what a fresh database starts with, and its readable mirror in
 * `.forge/tools/catalog.yaml` must not drift from it.
 *
 * Pins: loadCatalogue(), effectiveCatalogue(), BUILT_IN_CATALOGUE, schemaMatches().
 * Depends on: domain/catalogue, domain/catalogue-seed, helpers/fixtures, yaml. IO: reads the
 *   mirror file.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { BUILT_IN_CATALOGUE } from '#/domain/catalogue-seed.js';
import { effectiveCatalogue, loadCatalogue, schemaMatches } from '#/domain/catalogue.js';
import { CatalogueDoc } from '#/schemas/catalogue.js';
import { ENTRIES, catalogueDoc, liveHashes } from '#tests/helpers/fixtures.js';

const NEW_HASH = `sha256:${'a'.repeat(64)}`;
const quarantined = { status: 'quarantined', reason: 'malformed' };

describe('loadCatalogue', () => {
  it('loads a valid catalogue and hashes its canonical entries', () => {
    const state = loadCatalogue(catalogueDoc());

    expect(state.status).toBe('verified');
    expect(state.status === 'verified' && state.tools.size).toBe(ENTRIES.length);
    expect(loadCatalogue(catalogueDoc())).toEqual(state);
  });

  it('changes its hash when any field changes', () => {
    const changed = ENTRIES.map((e) => (e.id === 'read' ? { ...e, risk: 'exec' } : e));
    const a = loadCatalogue(catalogueDoc());
    const b = loadCatalogue(catalogueDoc(changed));

    expect(a.status === 'verified' && b.status === 'verified' && a.hash !== b.hash).toBe(
      true,
    );
  });

  it('quarantines a document that is not a catalogue', () => {
    expect(loadCatalogue(null)).toEqual(quarantined);
    expect(loadCatalogue('entries')).toEqual(quarantined);
    expect(loadCatalogue({ entries: [] })).toEqual(quarantined);
    expect(loadCatalogue({ entries: [{ id: 'read' }] })).toEqual(quarantined);
  });

  it('quarantines a duplicate id', () => {
    expect(loadCatalogue(catalogueDoc([...ENTRIES, ENTRIES[0]]))).toEqual(quarantined);
  });

  it('quarantines an MCP tool without a schema hash but accepts a native one without', () => {
    const mcp = ENTRIES.map((e) =>
      e.id === 'mcp__forge__finish' ? { ...e, schema_hash: undefined } : e,
    );

    const native = ENTRIES.map((e) =>
      e.id === 'read' ? { ...e, schema_hash: undefined } : e,
    );

    expect(loadCatalogue(catalogueDoc(mcp))).toEqual(quarantined);
    expect(loadCatalogue(catalogueDoc(native)).status).toBe('verified');
  });

  it('never throws on hostile input', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;

    expect(() => loadCatalogue(cyclic)).not.toThrow();
    expect(() =>
      loadCatalogue({ entries: [{ ...ENTRIES[0], resources: [Number.NaN] }] }),
    ).not.toThrow();
  });
});

describe('effectiveCatalogue', () => {
  const doc = catalogueDoc();
  const approved = { tool: 'read', schema_hash: NEW_HASH, status: 'approved' } as const;

  it('gives an approved native tool the approved hash, live and in the entry', () => {
    const eff = effectiveCatalogue(doc, [approved]);
    const read = eff.catalogue.status === 'verified' && eff.catalogue.tools.get('read');

    expect(read && read.schema_hash).toBe(NEW_HASH);
    expect(eff.liveSchemaHashes['read']).toBe(NEW_HASH);
    expect(eff.schemaStatus['read']).toBeUndefined();
  });

  it('marks every native tool without an approved row pending, and a denied one denied', () => {
    const eff = effectiveCatalogue(doc, [
      approved,
      { tool: 'grep', schema_hash: NEW_HASH, status: 'pending' },
      { tool: 'edit', schema_hash: NEW_HASH, status: 'denied' },
    ]);

    expect(eff.schemaStatus).toEqual({
      grep: 'pending',
      edit: 'denied',
      glob: 'pending',
      write: 'pending',
      shell: 'pending',
    });

    expect(eff.liveSchemaHashes).toEqual({ read: NEW_HASH });
  });

  it('leaves MCP tools out of the native tables', () => {
    const eff = effectiveCatalogue(doc, []);

    expect(Object.keys(eff.schemaStatus).some((t) => t.startsWith('mcp__'))).toBe(false);
  });

  it('records a different catalogue hash once a native schema is approved', () => {
    const none = effectiveCatalogue(doc, []).catalogue;
    const some = effectiveCatalogue(doc, [approved]).catalogue;

    expect(none.status === 'verified' && some.status === 'verified').toBe(true);
    expect(
      none.status === 'verified' && some.status === 'verified' && none.hash,
    ).not.toBe(some.status === 'verified' && some.hash);
  });

  it('quarantines for a bad document and never throws', () => {
    expect(effectiveCatalogue({ entries: [] }, [approved]).catalogue).toEqual(
      quarantined,
    );

    expect(() => effectiveCatalogue(undefined, [approved])).not.toThrow();
  });
});

describe('the built-in catalogue (version 1)', () => {
  it('equals the mirror in .forge/tools/catalog.yaml', () => {
    const file = new URL('../../../../.forge/tools/catalog.yaml', import.meta.url);
    const mirror = CatalogueDoc.parse(parse(readFileSync(file, 'utf8')));

    expect(BUILT_IN_CATALOGUE).toEqual(mirror);
  });

  it('loads, and its native tools carry no schema hash of their own', () => {
    const state = loadCatalogue(BUILT_IN_CATALOGUE);
    const natives =
      state.status === 'verified'
        ? [...state.tools.values()].filter((t) => t.kind === 'harness-native')
        : [];

    expect(state.status).toBe('verified');
    expect(natives.map((t) => t.id)).toEqual([
      'read',
      'glob',
      'grep',
      'edit',
      'write',
      'shell',
      'task',
    ]);

    expect(natives.every((t) => t.schema_hash === undefined)).toBe(true);
  });
});

describe('schemaMatches', () => {
  const state = loadCatalogue(catalogueDoc());
  const def = state.status === 'verified' ? state.tools.get('read') : undefined;

  it('accepts the catalogue hash and rejects a changed or missing one', () => {
    if (!def) {
      throw new Error('fixture');
    }

    expect(schemaMatches(def, liveHashes())).toBe(true);
    expect(schemaMatches(def, { read: `sha256:${'0'.repeat(64)}` })).toBe(false);
    expect(schemaMatches(def, {})).toBe(false);
  });

  it('does not read inherited object properties', () => {
    if (!def) {
      throw new Error('fixture');
    }

    expect(schemaMatches({ ...def, id: 'toString' }, {})).toBe(false);
  });
});
