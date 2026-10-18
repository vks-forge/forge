/**
 * Pins who may call the three project-memory tools: Standard and Full Workers, never Express.
 *
 * Why: Workers read the owner's decisions through `memory_search`, `memory_get` and `memory_related`
 *   (d-0168). The read-only tools are granted in the Standard and Full lanes only: Express keeps the
 *   byte-identical tool list it had before, because its Worker already gets the pasted pinned and top-k
 *   block. A tool nobody granted, or a name the catalogue never heard of, must be denied: fail closed,
 *   so a Worker cannot reach project memory by guessing a tool id, and a project that narrows its
 *   allow list takes the memory tools away with everything else.
 *
 * Pins: lane ceilings and rules for the three tools, Express never lists one, admit() verdicts per lane,
 *   a narrowing project grant denies them, an unknown memory tool denies as not granted, and the built-in
 *   catalogue lists the three with risk read and their pinned schema hashes.
 * Depends on: domain/lane-defaults, domain/admit, domain/grants, domain/catalogue-seed, helpers/fixtures, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { admit, visibleTools } from '#/domain/admit.js';
import { BUILT_IN_CATALOGUE } from '#/domain/catalogue-seed.js';
import { checkToolGranted, effectiveGrant } from '#/domain/grants.js';
import { LANE_DEFAULTS, laneRulesFor } from '#/domain/lane-defaults.js';
import { call, grant, makeCtx } from '#tests/helpers/fixtures.js';

const MEMORY = ['memory_search', 'memory_get', 'memory_related'].map(
  (t) => `mcp__forge__${t}`,
);

describe('memory tool grants', () => {
  it('never puts a memory tool in the Express ceiling, so its tool list stays as it was', () => {
    for (const id of MEMORY) {
      expect(LANE_DEFAULTS.express.allow).not.toContain(id);
      expect(LANE_DEFAULTS.express.deny).not.toContain(id);
      expect(checkToolGranted(effectiveGrant('express'), id).granted).toBe(false);
    }

    expect(laneRulesFor('express').some((r) => r.action.startsWith('memory_'))).toBe(
      false,
    );
  });

  it('grants all three in Standard and Full, with an allow rule each', () => {
    for (const lane of ['standard', 'full'] as const) {
      for (const id of MEMORY) {
        expect(LANE_DEFAULTS[lane].allow).toContain(id);
        expect(checkToolGranted(effectiveGrant(lane), id).granted, `${lane} ${id}`).toBe(
          true,
        );
      }

      const rules = laneRulesFor(lane).filter((r) => r.action.startsWith('memory_'));
      expect(rules.map((r) => [r.action, r.resource, r.effect])).toEqual(
        ['memory_search', 'memory_get', 'memory_related'].map((a) => [a, '*', 'allow']),
      );
    }
  });

  it('lists the memory tools to Standard and Full Workers only', () => {
    const ids = (lane: 'express' | 'standard' | 'full') =>
      visibleTools(makeCtx(lane)).map((t) => t.id);

    expect(ids('express').filter((id) => MEMORY.includes(id))).toEqual([]);
    for (const lane of ['standard', 'full'] as const) {
      expect(
        ids(lane)
          .filter((id) => MEMORY.includes(id))
          .sort(),
      ).toEqual([...MEMORY].sort());
    }
  });

  it.each(MEMORY)(
    'admit() allows %s in Standard and Full and denies it in Express',
    (id) => {
      for (const lane of ['standard', 'full'] as const) {
        const d = admit(makeCtx(lane), call(id, { query: 'x' }));
        expect([d.decision, d.reason]).toEqual(['allow', 'rule_allow']);
      }

      const denied = admit(makeCtx('express'), call(id, { query: 'x' }));
      expect([denied.decision, denied.reason]).toEqual(['deny', 'not_granted']);
    },
  );

  it('denies a memory tool when a project allow list does not name it', () => {
    const ctx = makeCtx('standard', {}, { project: grant({ allow: ['read', 'shell'] }) });

    for (const id of MEMORY) {
      const d = admit(ctx, call(id, { query: 'x' }));
      expect([d.decision, d.reason]).toEqual(['deny', 'not_granted']);
    }
  });

  it('denies a memory tool nobody defined, in every lane (fail closed)', () => {
    for (const lane of ['express', 'standard', 'full'] as const) {
      for (const id of [
        'mcp__forge__memory_write',
        'mcp__forge__memory_delete',
        'memory_search',
      ]) {
        const d = admit(makeCtx(lane), call(id, {}));
        expect(d.decision, `${lane} ${id}`).toBe('deny');
      }
    }
  });

  it('lists the three tools in the built-in catalogue as read tools with pinned schema hashes', () => {
    const byId = new Map(BUILT_IN_CATALOGUE.entries.map((e) => [e.id, e]));

    for (const id of MEMORY) {
      const e = byId.get(id);
      expect(e?.risk, id).toBe('read');
      expect(e?.exposure, id).toBe('direct');
      expect(e?.schema_hash, id).toMatch(/^sha256:[0-9a-f]{64}$/);
    }

    expect(byId.get('mcp__forge__memory_search')?.schema_hash).toBe(
      MEMORY_HASHES.memory_search,
    );

    expect(byId.get('mcp__forge__memory_get')?.schema_hash).toBe(
      MEMORY_HASHES.memory_get,
    );

    expect(byId.get('mcp__forge__memory_related')?.schema_hash).toBe(
      MEMORY_HASHES.memory_related,
    );
  });
});

/** The hashes the live MCP server advertises (pinned equal in the mcp catalogue test). */
const MEMORY_HASHES = {
  memory_search:
    'sha256:395fd52a049244e5a1b30925f2dbc35e7f500c5697cc29fb5bf3661e7976760c',
  memory_get: 'sha256:321f209aa8bd618ef529ff3c2c0f1303467f758a09f5ecfd6955951f9b81d237',
  memory_related:
    'sha256:5f6008dd8dbcca2bb6f8bd6cb2bbfb5a67ed503f344d2e203c9079a08381a3b5',
};
