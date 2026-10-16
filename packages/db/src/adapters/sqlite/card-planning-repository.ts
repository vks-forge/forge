/**
 * SQLite CardPlanningRepository for the planning columns of `cards` and the `card_plans` table.
 *
 * Why: the Director plans a card over several ticks and may restart between any two, so the
 *   flow it started with, its cursor, the grill state and every plan version are rows, not
 *   engine memory. Every value is parsed with the core schema on the way in (a bad grill state
 *   or flow is refused before it is stored) and on the way out (a row this version cannot read
 *   fails closed instead of feeding the engine a half-typed object). Plan versions are
 *   append-only: a second writer of the same (card, version) is refused, never overwritten
 *   (d-0132). All writes run inside the caller's transaction, so they commit or roll back with
 *   the card events and phase move that describe them.
 *
 * Exports: createCardPlanningRepository().
 * Depends on: @forge/core, shared/db-errors, shared/json, types/storage-driver.types.
 */

import { DirectorFlow, GrillState, InvalidInputError, PlanVersion } from '@forge/core';
import type { CardPlanningRepository, CardPlanningState } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import { fromJson, toJson } from '#/shared/json.js';
import type { SqlDriver, SqlRow, SqlValue } from '#/types/storage-driver.types.js';

const toPlan = (row: SqlRow): PlanVersion =>
  parseStored(PlanVersion, fromJson(row['plan_json']), 'card plan');

const toState = (row: SqlRow): CardPlanningState => ({
  flow:
    row['flow_json'] === null
      ? null
      : parseStored(DirectorFlow, fromJson(row['flow_json']), 'card flow'),
  flow_config_version: (row['flow_config_version'] as number | null) ?? null,
  flow_cursor: (row['flow_cursor'] as number | null) ?? null,
  grill: parseStored(GrillState, fromJson(row['grill_state_json']), 'grill state'),
});

export function createCardPlanningRepository(driver: SqlDriver): CardPlanningRepository {
  const cardExists = (cardId: string): boolean =>
    driver.get('SELECT 1 AS present FROM cards WHERE id = ?', [cardId]) !== undefined;

  return {
    async get(cardId) {
      const row = driver.get(
        `SELECT flow_json, flow_config_version, flow_cursor, grill_state_json
         FROM cards WHERE id = ?`,
        [cardId],
      );

      return row
        ? toState(row)
        : {
            flow: null,
            flow_config_version: null,
            flow_cursor: null,
            grill: GrillState.parse({}),
          };
    },

    async update(cardId, patch) {
      const sets: string[] = [];
      const params: SqlValue[] = [];
      const set = (column: string, value: SqlValue): void => {
        sets.push(`${column} = ?`);
        params.push(value);
      };

      // Validate everything before the first write so a refused patch changes nothing.
      if (patch.flow !== undefined) {
        set(
          'flow_json',
          patch.flow === null ? null : toJson(DirectorFlow.parse(patch.flow)),
        );
      }

      if (patch.flow_config_version !== undefined) {
        set('flow_config_version', patch.flow_config_version);
      }

      if (patch.flow_cursor !== undefined) {
        set('flow_cursor', patch.flow_cursor);
      }

      if (patch.grill !== undefined) {
        set('grill_state_json', toJson(GrillState.parse(patch.grill)));
      }

      if (sets.length === 0) {
        return cardExists(cardId);
      }

      const res = driver.run(`UPDATE cards SET ${sets.join(', ')} WHERE id = ?`, [
        ...params,
        cardId,
      ]);

      return res.changes === 1;
    },

    async appendPlan(plan) {
      const p = PlanVersion.parse(plan);
      if (!cardExists(p.card_id)) {
        throw new InvalidInputError(`card ${p.card_id} does not exist`);
      }

      const taken = driver.get(
        'SELECT 1 AS present FROM card_plans WHERE card_id = ? AND version = ?',
        [p.card_id, p.version],
      );

      if (taken) {
        throw new InvalidInputError(
          `card ${p.card_id} already has a plan version ${p.version}`,
        );
      }

      driver.run(
        `INSERT INTO card_plans (card_id, version, plan_json, created_at, author)
         VALUES (?, ?, ?, ?, ?)`,
        [p.card_id, p.version, toJson(p), p.created_at, p.author],
      );
    },

    async listPlans(cardId) {
      return driver
        .all('SELECT plan_json FROM card_plans WHERE card_id = ? ORDER BY version', [
          cardId,
        ])
        .map(toPlan);
    },

    async getPlan(cardId, version) {
      const row = driver.get(
        'SELECT plan_json FROM card_plans WHERE card_id = ? AND version = ?',
        [cardId, version],
      );

      return row ? toPlan(row) : null;
    },

    async latestPlan(cardId) {
      const row = driver.get(
        'SELECT plan_json FROM card_plans WHERE card_id = ? ORDER BY version DESC LIMIT 1',
        [cardId],
      );

      return row ? toPlan(row) : null;
    },
  };
}
