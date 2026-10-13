/**
 * Pins grant-building invariants as properties: narrowing never widens, deny always wins.
 *
 * Why: grant files are written by different people at different times; whatever they
 * contain, the effective tool set must never exceed the lane ceiling (plus the
 * project-gated tools a project names), never exceed any layer's allow list, and never
 * include a denied tool. Random layers probe combinations example tests miss.
 *
 * Pins: effectiveGrant() and checkToolGranted() invariants.
 * Depends on: domain/grants, domain/lane-defaults, helpers/fixtures, fast-check, vitest. No IO.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkToolGranted, effectiveGrant } from '#/domain/grants.js';
import { LANE_DEFAULTS } from '#/domain/lane-defaults.js';
import { isProjectMcp } from '#/domain/tool-id.js';
import { toolMatch } from '#/shared/pattern.js';
import { ENTRIES, grant } from '#tests/helpers/fixtures.js';

const IDS = ENTRIES.map((e) => e.id as string);
const granted = (g: ReturnType<typeof effectiveGrant>, id: string) =>
  checkToolGranted(g, id).granted;

const subset = fc.subarray(IDS);
const grantArb = fc.record({
  allow: fc.option(subset, { nil: undefined }),
  deny: fc.subarray(IDS, { maxLength: 3 }),
});

const toGrant = (g: { allow: string[] | undefined; deny: string[] }) =>
  grant(g.allow === undefined ? { deny: g.deny } : { allow: g.allow, deny: g.deny });

describe('grant properties', () => {
  it('never grants a tool outside the lane ceiling, a layer allow list, or any deny', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('express', 'standard', 'full'),
        grantArb,
        grantArb,
        (lane, p, t) => {
          const eff = effectiveGrant(lane, toGrant(p), toGrant(t));
          const d = LANE_DEFAULTS[lane];
          for (const id of IDS) {
            if (!granted(eff, id)) {
              continue;
            }

            const inLane = d.allow.includes(id);
            const gatedByProject =
              (d.projectGated.includes(id) || (d.projectMcps && isProjectMcp(id))) &&
              (p.allow ?? []).some((a) => toolMatch(a, id));

            expect(inLane || gatedByProject).toBe(true);
            expect(p.allow === undefined || p.allow.some((a) => toolMatch(a, id))).toBe(
              true,
            );

            expect(t.allow === undefined || t.allow.some((a) => toolMatch(a, id))).toBe(
              true,
            );

            expect([...p.deny, ...t.deny, ...d.deny].some((x) => toolMatch(x, id))).toBe(
              false,
            );
          }
        },
      ),
    );
  });

  it('adding a ticket layer never grows the visible set', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('express', 'standard', 'full'),
        grantArb,
        grantArb,
        (lane, p, t) => {
          const without = effectiveGrant(lane, toGrant(p));
          const withTicket = effectiveGrant(lane, toGrant(p), toGrant(t));
          for (const id of IDS) {
            if (granted(withTicket, id)) {
              expect(granted(without, id)).toBe(true);
            }
          }
        },
      ),
    );
  });

  it('a denied tool is never granted whatever else is allowed', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('express', 'standard', 'full'),
        fc.constantFrom(...IDS),
        (lane, id) => {
          const eff = effectiveGrant(
            lane,
            grant({ allow: IDS, deny: [id] }),
            grant({ allow: IDS }),
          );

          expect(granted(eff, id)).toBe(false);
        },
      ),
    );
  });
});
