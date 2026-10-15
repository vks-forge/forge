/**
 * SQLite CardTypeRepository for the `card_types` table.
 *
 * Why: card types are data, not code (d-0106): intake asks this registry whether a type
 *   starts tickets at once or waits for a plan, and which sources it accepts. Rows are
 *   re-parsed with the core `CardType` schema on read, so a registry row edited into an
 *   invalid shape stops intake (fail closed) instead of silently allowing a source.
 *
 * Exports: createCardTypeRepository().
 * Depends on: @forge/core, shared/db-errors, shared/json, types/storage-driver.types.
 */

import { CardType } from '@forge/core';
import type { CardTypeRepository } from '@forge/core';
import { parseStored } from '#/shared/db-errors.js';
import { dropNulls, fromJson, toJson } from '#/shared/json.js';
import type { SqlDriver, SqlRow } from '#/types/storage-driver.types.js';

const toType = (row: SqlRow): CardType => {
  const r = dropNulls(row);

  return parseStored(
    CardType,
    {
      name: r['name'],
      label: r['label'],
      icon: r['icon'],
      allowed_sources: fromJson(r['allowed_sources_json']),
      actions: fromJson(r['actions_json']),
      plan_approval: r['plan_approval'] === 1,
      tickets_on_intake: r['tickets_on_intake'] === 1,
      ...(r['default_lane'] === undefined ? {} : { default_lane: r['default_lane'] }),
    },
    'card type',
  );
};

export function createCardTypeRepository(driver: SqlDriver): CardTypeRepository {
  return {
    async get(name) {
      const row = driver.get('SELECT * FROM card_types WHERE name = ?', [name]);

      return row ? toType(row) : null;
    },

    async list() {
      return driver.all('SELECT * FROM card_types ORDER BY rowid').map(toType);
    },

    async upsert(type) {
      const t = CardType.parse(type);
      driver.run(
        `INSERT INTO card_types (name, label, icon, allowed_sources_json, actions_json,
           plan_approval, tickets_on_intake, default_lane)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (name) DO UPDATE SET label = excluded.label, icon = excluded.icon,
           allowed_sources_json = excluded.allowed_sources_json,
           actions_json = excluded.actions_json, plan_approval = excluded.plan_approval,
           tickets_on_intake = excluded.tickets_on_intake, default_lane = excluded.default_lane`,
        [
          t.name,
          t.label,
          t.icon,
          toJson(t.allowed_sources),
          toJson(t.actions),
          t.plan_approval ? 1 : 0,
          t.tickets_on_intake ? 1 : 0,
          t.default_lane ?? null,
        ],
      );
    },
  };
}
