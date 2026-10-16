/**
 * SQLite purge of everything a project owns, in foreign-key-safe order.
 *
 * Why: deleting a project must leave no ticket, run, receipt or card behind, or re-adding
 *   the same folder and slug would show another project's old history under it. Most tables
 *   point at a project only through a ticket or a run, so the rows are found by walking
 *   project -> tickets -> runs -> per-run records and removed leaf-first. The settings
 *   history (`config_versions`) is left alone on purpose: its rows are append-only by a
 *   trigger, and a re-added slug appends a new version on top. The caller runs this inside
 *   one storage transaction, so a failure part way removes nothing.
 *
 * Exports: purgeProject().
 * Depends on: types/storage-driver.types. IO: SQL deletes through the given driver.
 */

import type { SqlDriver } from '#/types/storage-driver.types.js';

const TICKETS = 'SELECT id FROM tickets WHERE project = ?';
const CARDS = 'SELECT id FROM cards WHERE project = ?';
const RUNS = `SELECT id FROM runs WHERE project = ? OR ticket_id IN (${TICKETS})`;

/** Remove the project's rows from every table; false when the project row did not exist. */
export function purgeProject(driver: SqlDriver, slug: string): boolean {
  // Every placeholder is the slug, so the parameter list is built from the SQL itself.
  const del = (sql: string): void => {
    driver.run(sql, Array<string>(sql.split('?').length - 1).fill(slug));
  };

  // Receipts first: effects can be keyed by run or only by their decision.
  del(
    `DELETE FROM tool_effects WHERE run_id IN (${RUNS})
       OR decision_id IN (SELECT id FROM tool_decisions WHERE run_id IN (${RUNS}))`,
  );

  for (const table of [
    'tool_decisions',
    'receipt_resumes',
    'skill_usage',
    'run_tokens',
    'gate_results',
    'run_events',
    'run_inbox',
  ]) {
    del(`DELETE FROM ${table} WHERE run_id IN (${RUNS})`);
  }

  del(
    `DELETE FROM interactions WHERE ticket_id IN (${TICKETS}) OR run_id IN (${RUNS}) OR card_id IN (${CARDS})`,
  );

  del(`DELETE FROM wake_requests WHERE ticket_id IN (${TICKETS})`);
  del(
    `DELETE FROM ticket_relations WHERE from_id IN (${TICKETS}) OR to_id IN (${TICKETS})`,
  );

  del('DELETE FROM intake_events WHERE project = ?');
  del(`DELETE FROM runs WHERE project = ? OR ticket_id IN (${TICKETS})`);
  del('DELETE FROM tickets WHERE project = ?');
  del(`DELETE FROM card_events WHERE card_id IN (${CARDS})`);
  del(`DELETE FROM card_reply_queue WHERE card_id IN (${CARDS})`);
  del(
    `DELETE FROM card_relations WHERE from_card IN (${CARDS}) OR to_card IN (${CARDS})`,
  );

  del('DELETE FROM cards WHERE project = ?');
  del('DELETE FROM inbox_states WHERE project = ?');

  return driver.run('DELETE FROM projects WHERE slug = ?', [slug]).changes > 0;
}
