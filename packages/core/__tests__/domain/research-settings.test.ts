/**
 * Tests for the effective research settings.
 *
 * Why: the company sets which search provider and which hosts research may reach; a project may only
 *   narrow that (turn research off, add hosts to refuse, limit the hosts it may fetch). If a project
 *   could widen it, one repository's settings could send queries and fetches somewhere the company
 *   never allowed. An allow list that narrowed to nothing must not turn into "no list", which means
 *   everything allowed, so it disables research instead.
 *
 * Pins: company values pass through; a project can disable, add deny hosts and narrow the allow list;
 *   an empty intersection disables; provider none is disabled; by property allow is a subset of the
 *   company's when it is set, deny is a superset and disabled stays disabled.
 * Depends on: src/domain/research-settings, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { effectiveResearch } from '#/domain/research-settings.js';
import type { ProjectResearch, ResearchSettings } from '#/schemas/research-settings.js';

const company = (allow: string[] = [], deny: string[] = []): ResearchSettings => ({
  provider: 'searxng',
  searxng: { base_url: 'http://localhost:8888', allow_hosts: [] },
  fetch: { allow_hosts: allow, deny_hosts: deny, timeout_ms: 10_000 },
});

describe('effectiveResearch', () => {
  it('passes the company settings through when there is no project override', () => {
    expect(effectiveResearch(company(['a.com'], ['b.com']))).toEqual({
      enabled: true,
      provider: 'searxng',
      allowHosts: ['a.com'],
      denyHosts: ['b.com'],
    });
  });

  it('lets a project disable research', () => {
    expect(effectiveResearch(company(), { enabled: false }).enabled).toBe(false);
  });

  it('adds project deny hosts and intersects allow hosts', () => {
    const r = effectiveResearch(company(['a.com', 'b.com'], ['x.com']), {
      allow_hosts: ['b.com', 'c.com'],
      deny_hosts: ['y.com'],
    });

    expect(r.allowHosts).toEqual(['b.com']);
    expect([...r.denyHosts].sort()).toEqual(['x.com', 'y.com']);
    expect(r.enabled).toBe(true);
  });

  it('lets a project narrow an open company allow list', () => {
    expect(effectiveResearch(company(), { allow_hosts: ['a.com'] }).allowHosts).toEqual([
      'a.com',
    ]);
  });

  it('disables research when the intersection is empty instead of allowing everything', () => {
    const r = effectiveResearch(company(['a.com']), { allow_hosts: ['b.com'] });

    expect(r.enabled).toBe(false);
  });

  it('is disabled when the provider is none', () => {
    expect(effectiveResearch({ ...company(), provider: 'none' }).enabled).toBe(false);
  });

  it('never widens the company settings (property)', () => {
    const host = fc.constantFrom('a.com', 'b.com', 'c.com', 'd.com');
    const hosts: fc.Arbitrary<string[]> = fc.uniqueArray(host, { maxLength: 4 });

    fc.assert(
      fc.property(
        hosts,
        hosts,
        fc.record(
          { enabled: fc.boolean(), allow_hosts: hosts, deny_hosts: hosts },
          { requiredKeys: [] },
        ),
        (allow, deny, project) => {
          const c = company(allow, deny);
          const base = effectiveResearch(c);
          const r = effectiveResearch(c, project as ProjectResearch);

          if (allow.length > 0) {
            expect(r.allowHosts.every((h) => allow.includes(h))).toBe(true);
          }

          expect(deny.every((h) => r.denyHosts.includes(h))).toBe(true);
          expect(r.enabled && !base.enabled).toBe(false);
          if (project.enabled === false) {
            expect(r.enabled).toBe(false);
          }

          if (r.enabled && allow.length > 0) {
            expect(r.allowHosts.length).toBeGreaterThan(0);
          }
        },
      ),
    );
  });
});
