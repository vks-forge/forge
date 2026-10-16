/**
 * Contract cases for `cardPlanning`: planning state and plan versions.
 *
 * Why: the Director plans a card over several ticks and may be restarted between any two,
 *   so the flow snapshot, its cursor, the grill state and every plan version must come back
 *   exactly as written, on SQLite and in memory alike. A card that never planned must read
 *   as empty (not as an error), a clear must really clear, and a bad grill state or flow
 *   must be refused before it is stored, or a later tick would fail to read its own card.
 *   Plan versions are append-only and a second writer of the same version must lose
 *   (d-0132); one card's plans never show under another; and a rolled-back transaction
 *   leaves no plan and no planning state behind, so a history line never claims a plan that
 *   was undone.
 *
 * Exports: describeCardPlanningContract().
 * Depends on: vitest, @forge/core, helpers/card-planning. IO only through the adapter under test.
 */

import type { GrillState, StorageAdapter } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { FLOW, card, grill, id, plan } from '#tests/helpers/card-planning.js';

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeCardPlanningContract(getDb: () => StorageAdapter): void {
  const tx: StorageAdapter['transaction'] = (fn) => getDb().transaction(fn);

  const seedCards = (count: number) =>
    tx(async (t) => {
      for (let n = 1; n <= count; n++) {
        await t.cards.insert(card(n));
      }
    });

  describe('cardPlanning state', () => {
    it('reads defaults for a card that never planned and for an unknown card', async () => {
      await seedCards(1);

      for (const cardId of [id(1), id(9)]) {
        const state = await tx((t) => t.cardPlanning.get(cardId));

        expect(state.flow).toBeNull();
        expect(state.flow_config_version).toBeNull();
        expect(state.flow_cursor).toBeNull();
        expect(state.grill.answers).toEqual([]);
        expect(state.grill.current).toBeNull();
        expect(state.grill.done).toBe(false);
      }
    });

    it('round-trips flow, config version, cursor and grill state', async () => {
      await seedCards(1);

      const ok = await tx((t) =>
        t.cardPlanning.update(id(1), {
          flow: FLOW,
          flow_config_version: 7,
          flow_cursor: 2,
          grill: grill(),
        }),
      );

      const state = await tx((t) => t.cardPlanning.get(id(1)));

      expect(ok).toBe(true);
      expect(state.flow).toEqual(FLOW);
      expect(state.flow_config_version).toBe(7);
      expect(state.flow_cursor).toBe(2);
      expect(state.grill).toEqual(grill());
    });

    it('keeps the fields a patch leaves out', async () => {
      await seedCards(1);
      await tx((t) =>
        t.cardPlanning.update(id(1), {
          flow: FLOW,
          flow_config_version: 7,
          flow_cursor: 2,
          grill: grill(),
        }),
      );

      await tx((t) => t.cardPlanning.update(id(1), { flow_cursor: 3 }));

      const state = await tx((t) => t.cardPlanning.get(id(1)));

      expect(state.flow_cursor).toBe(3);
      expect(state.flow).toEqual(FLOW);
      expect(state.flow_config_version).toBe(7);
      expect(state.grill).toEqual(grill());
    });

    it('clears the flow fields with null and leaves the grill state', async () => {
      await seedCards(1);
      await tx((t) =>
        t.cardPlanning.update(id(1), {
          flow: FLOW,
          flow_config_version: 7,
          flow_cursor: 2,
          grill: grill(),
        }),
      );

      await tx((t) =>
        t.cardPlanning.update(id(1), {
          flow: null,
          flow_config_version: null,
          flow_cursor: null,
        }),
      );

      const state = await tx((t) => t.cardPlanning.get(id(1)));

      expect(state.flow).toBeNull();
      expect(state.flow_config_version).toBeNull();
      expect(state.flow_cursor).toBeNull();
      expect(state.grill).toEqual(grill());
    });

    it('returns false when the card does not exist', async () => {
      expect(await tx((t) => t.cardPlanning.update(id(9), { flow_cursor: 1 }))).toBe(
        false,
      );
    });

    it('refuses a grill state or a flow that fails its schema and stores nothing', async () => {
      await seedCards(1);

      await expect(
        tx((t) =>
          t.cardPlanning.update(id(1), {
            grill: { ...grill(), asked: -1 } as GrillState,
          }),
        ),
      ).rejects.toThrow();

      await expect(
        tx((t) =>
          t.cardPlanning.update(id(1), {
            flow: [{ nope: true }] as never,
            flow_cursor: 1,
          }),
        ),
      ).rejects.toThrow();

      const state = await tx((t) => t.cardPlanning.get(id(1)));

      expect(state.flow).toBeNull();
      expect(state.flow_cursor).toBeNull();
      expect(state.grill.asked).toBe(0);
    });

    it('returns copies, so editing a result does not change the stored state', async () => {
      await seedCards(1);
      await tx((t) => t.cardPlanning.update(id(1), { grill: grill() }));

      const first = await tx((t) => t.cardPlanning.get(id(1)));
      first.grill.assumptions.push('mutated');

      const second = await tx((t) => t.cardPlanning.get(id(1)));

      expect(second.grill.assumptions).toEqual(['uses sqlite']);
    });

    it('leaves no planning change when the transaction rolls back', async () => {
      await seedCards(1);

      await expect(
        tx(async (t) => {
          await t.cardPlanning.update(id(1), {
            flow: FLOW,
            flow_cursor: 1,
            grill: grill(),
          });

          await t.cardPlanning.appendPlan(plan(1, 1));

          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      const state = await tx((t) => t.cardPlanning.get(id(1)));

      expect(state.flow).toBeNull();
      expect(state.flow_cursor).toBeNull();
      expect(state.grill.asked).toBe(0);
      expect(await tx((t) => t.cardPlanning.listPlans(id(1)))).toEqual([]);
    });
  });

  describe('cardPlanning plans', () => {
    it('stores a version and reads it back by number, in the list and as the latest', async () => {
      await seedCards(1);

      await tx((t) => t.cardPlanning.appendPlan(plan(1, 1)));

      expect(await tx((t) => t.cardPlanning.getPlan(id(1), 1))).toEqual(plan(1, 1));
      expect(await tx((t) => t.cardPlanning.latestPlan(id(1)))).toEqual(plan(1, 1));
      expect(await tx((t) => t.cardPlanning.listPlans(id(1)))).toEqual([plan(1, 1)]);
    });

    it('reads null for a missing version and for a card with no plan', async () => {
      await seedCards(1);

      expect(await tx((t) => t.cardPlanning.getPlan(id(1), 1))).toBeNull();
      expect(await tx((t) => t.cardPlanning.latestPlan(id(1)))).toBeNull();
      expect(await tx((t) => t.cardPlanning.listPlans(id(1)))).toEqual([]);
    });

    it('keeps the owner author and the diff of a later version', async () => {
      await seedCards(1);
      const v2 = plan(1, 2, {
        author: 'owner',
        diff_from_previous: [{ field: 'goal', before: 'a', after: 'b' }],
      });

      await tx(async (t) => {
        await t.cardPlanning.appendPlan(plan(1, 1));
        await t.cardPlanning.appendPlan(v2);
      });

      expect(await tx((t) => t.cardPlanning.getPlan(id(1), 2))).toEqual(v2);
    });

    it('lists versions oldest first whatever order they were written in, and latest is the highest', async () => {
      await seedCards(1);

      await tx(async (t) => {
        await t.cardPlanning.appendPlan(plan(1, 3));
        await t.cardPlanning.appendPlan(plan(1, 1));
        await t.cardPlanning.appendPlan(plan(1, 2));
      });

      const versions = (await tx((t) => t.cardPlanning.listPlans(id(1)))).map(
        (p) => p.version,
      );

      expect(versions).toEqual([1, 2, 3]);
      expect((await tx((t) => t.cardPlanning.latestPlan(id(1))))?.version).toBe(3);
    });

    it('refuses a second plan with the same version and keeps the first', async () => {
      await seedCards(1);
      await tx((t) => t.cardPlanning.appendPlan(plan(1, 1)));

      await expect(
        tx((t) => t.cardPlanning.appendPlan(plan(1, 1, { goal: 'other' }))),
      ).rejects.toMatchObject({ errorFamily: 'invalid_input' });

      expect((await tx((t) => t.cardPlanning.getPlan(id(1), 1)))?.goal).toBe('Goal v1');
    });

    it('refuses a plan for an unknown card', async () => {
      await expect(
        tx((t) => t.cardPlanning.appendPlan(plan(9, 1))),
      ).rejects.toMatchObject({
        errorFamily: 'invalid_input',
      });
    });

    it('refuses a plan that fails its schema', async () => {
      await seedCards(1);

      await expect(tx((t) => t.cardPlanning.appendPlan(plan(1, 0)))).rejects.toThrow();
      expect(await tx((t) => t.cardPlanning.listPlans(id(1)))).toEqual([]);
    });

    it('keeps each card plans apart', async () => {
      await seedCards(2);

      await tx(async (t) => {
        await t.cardPlanning.appendPlan(plan(1, 1));
        await t.cardPlanning.appendPlan(plan(2, 1, { goal: 'Other card' }));
        await t.cardPlanning.appendPlan(plan(2, 2, { goal: 'Other card v2' }));
      });

      expect(await tx((t) => t.cardPlanning.listPlans(id(1)))).toHaveLength(1);
      expect((await tx((t) => t.cardPlanning.latestPlan(id(2))))?.goal).toBe(
        'Other card v2',
      );
    });
  });
}
