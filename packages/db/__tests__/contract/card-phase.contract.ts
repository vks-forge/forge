/**
 * Contract cases for the stored card lifecycle: phase fields, the phase CAS and the dedupe lookup.
 *
 * Why: the card phase is written by `transitionCard()` and stored with a compare-and-swap on
 *   `phase_version` (d-0134), so two writers racing on one card cannot both win, in SQLite and
 *   in memory alike. The create-card dedupe finds the first card a source and reference made,
 *   within one project, so a double click never makes two. Priority and links must survive a
 *   round trip and a patch.
 *
 * Exports: describeCardPhaseContract().
 * Depends on: vitest, @forge/core, helpers/fixtures. IO only through the adapter under test.
 */

import type { Card, CardId, StorageAdapter } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { T0 } from '#tests/helpers/fixtures.js';

const id = (n: number) => `SF-C${n}` as CardId;
const at = (minute: number) => `2026-10-13T00:${String(minute).padStart(2, '0')}:00.000Z`;

const card = (n: number, over: Partial<Card> = {}): Card => ({
  id: id(n),
  project: 'SF',
  type: 'issue',
  title: `Card ${n}`,
  summary: 'summary',
  source: { kind: 'chat', ref: `msg-${n}` },
  created_by: { type: 'user', id: 'u1' },
  created_at: T0,
  updated_at: T0,
  phase: 'grilling',
  phase_version: 0,
  needs_you: false,
  priority: 'normal',
  links: [],
  ...over,
});

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeCardPhaseContract(getDb: () => StorageAdapter): void {
  const tx: StorageAdapter['transaction'] = (fn) => getDb().transaction(fn);

  describe('cards: lifecycle', () => {
    it('keeps priority, links, phase and the needs_you flag across a round trip', async () => {
      const full = card(1, {
        priority: 'urgent',
        links: ['https://example.com/a', 'http://example.com/b'],
        phase: 'plan_ready',
        phase_version: 4,
        needs_you: true,
      });

      await tx((t) => t.cards.insert(full));

      expect(await tx((t) => t.cards.get(id(1)))).toEqual(full);
    });

    it('finds the first card a source and reference made, within one project', async () => {
      await tx(async (t) => {
        await t.cards.insert(card(1, { source: { kind: 'chat', ref: 'k' } }));
        await t.cards.insert({
          ...card(2, { source: { kind: 'chat', ref: 'k' } }),
          project: 'OTHER',
        });
      });

      expect((await tx((t) => t.cards.findBySource('SF', 'chat', 'k')))?.id).toBe(
        'SF-C1',
      );

      expect((await tx((t) => t.cards.findBySource('OTHER', 'chat', 'k')))?.id).toBe(
        'SF-C2',
      );

      expect(await tx((t) => t.cards.findBySource('SF', 'cron', 'k'))).toBeNull();
      expect(await tx((t) => t.cards.findBySource('SF', 'chat', 'other'))).toBeNull();
    });

    it('moves the phase only for the writer that read the current version', async () => {
      await tx((t) => t.cards.insert(card(1)));
      const move = (version: number, phase: Card['phase'], needs: boolean) =>
        tx((t) =>
          t.cards.updatePhase(id(1), version, {
            phase,
            needs_you: needs,
            updated_at: at(8),
          }),
        );

      expect(await move(0, 'plan_ready', true)).toBe(true);
      expect(await move(0, 'approved', false)).toBe(false);
      expect(await tx((t) => t.cards.get(id(1)))).toMatchObject({
        phase: 'plan_ready',
        phase_version: 1,
        needs_you: true,
        updated_at: at(8),
      });

      expect(await move(1, 'approved', false)).toBe(true);
      expect((await tx((t) => t.cards.get(id(1))))?.phase_version).toBe(2);
      expect(
        await tx((t) =>
          t.cards.updatePhase(id(9), 0, {
            phase: 'closed',
            needs_you: false,
            updated_at: at(8),
          }),
        ),
      ).toBe(false);
    });

    it('updates priority and links through a patch', async () => {
      await tx((t) => t.cards.insert(card(1)));

      await tx((t) =>
        t.cards.update(id(1), {
          priority: 'high',
          links: ['https://example.com/x'],
          updated_at: at(3),
        }),
      );

      expect(await tx((t) => t.cards.get(id(1)))).toMatchObject({
        priority: 'high',
        links: ['https://example.com/x'],
      });
    });
  });
}
