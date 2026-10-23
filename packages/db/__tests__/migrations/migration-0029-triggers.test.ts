/**
 * Pins that the migration 0029 triggers make project memory append-only.
 *
 * Why: the triggers are the second lock behind the repository code, so a bug in code cannot rewrite what the
 *   owner approved. A record words, source, author, origin, confidence and dates, its history and the
 *   versions of its search aids can never change; a record can only move along approve, reject and
 *   supersede; and nothing is deleted except inside a project purge, which first puts one row in the purge
 *   guard table.
 *
 * Pins: every immutable column aborts an update, approved / rejected / superseded stamps cannot be
 *   rewritten, only the three legal (kind, status) edges pass and the other 239 abort, events and
 *   versions cannot be updated, deletes abort unless the purge guard holds a row, search aids may change.
 * Depends on: helpers/memory-sql, @forge/core, vitest. IO: in-memory SQLite.
 */

import { MemoryKind, MemoryStatus } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { STAMP, abortsWith, fresh, record } from '#tests/helpers/memory-sql.js';

describe('0029 memory: triggers', () => {
  const alternatives: Record<string, unknown> = {
    project: 'zzz',
    id: 'd-0099',
    statement: 'Changed',
    body: 'changed',
    source_type: 'other',
    source_ref: 'other',
    author: 'director',
    origin: 'agent',
    confidence: 0.1,
    created_at: '2026-01-01T00:00:00.000Z',
    valid_from: '2025-01-01',
    imported_from: 'x.md@abc',
    raw_front_matter: 'changed',
    lenient_fields: '["kind"]',
  };

  const immutable = Object.keys(alternatives);

  it.each(immutable)('aborts an update of %s', (column) => {
    const driver = fresh();
    record(driver, 'd-0001', {
      imported_from: 'a.md@abc',
      raw_front_matter: 'raw',
      lenient_fields: '[]',
    });

    abortsWith(
      driver,
      `UPDATE memory_records SET ${column} = ? WHERE project = 'forge' AND id = 'd-0001'`,
      [alternatives[column]],
      'memory_immutable',
    );
  });

  it('aborts an update of a column that is still NULL at insert for the NULL-able immutable ones', () => {
    const driver = fresh();
    record(driver);

    for (const column of ['imported_from', 'raw_front_matter', 'lenient_fields']) {
      abortsWith(
        driver,
        `UPDATE memory_records SET ${column} = 'x' WHERE id = 'd-0001'`,
        [],
        'memory_immutable',
      );
    }
  });

  it('lets the search aids change', () => {
    const driver = fresh();
    record(driver);

    expect(() =>
      driver.run(
        "UPDATE memory_records SET pinned = 1, gist = 'g', aliases = 'a b' WHERE id = 'd-0001'",
      ),
    ).not.toThrow();
  });

  it('lets a pending proposal be approved or rejected, once, and stamps cannot be rewritten', () => {
    const driver = fresh();
    record(driver, 'x-0001', { kind: 'proposal', status: 'pending', author: 'director' });
    record(driver, 'x-0002', { kind: 'proposal', status: 'pending', author: 'director' });

    expect(() =>
      driver.run(
        `UPDATE memory_records SET kind = 'decision', status = 'active', approved_at = ?, approved_by = 'me'
         WHERE id = 'x-0001'`,
        [STAMP],
      ),
    ).not.toThrow();

    expect(() =>
      driver.run(
        `UPDATE memory_records SET kind = 'rejected', status = 'rejected', rejected_at = ?, rejected_by = 'me',
           rejected_reason = 'no' WHERE id = 'x-0002'`,
        [STAMP],
      ),
    ).not.toThrow();

    for (const [col, id] of [
      ['approved_at', 'x-0001'],
      ['approved_by', 'x-0001'],
      ['rejected_at', 'x-0002'],
      ['rejected_by', 'x-0002'],
      ['rejected_reason', 'x-0002'],
    ] as const) {
      abortsWith(
        driver,
        `UPDATE memory_records SET ${col} = 'changed' WHERE id = ?`,
        [id],
        'memory_immutable',
      );
    }
  });

  it('lets an active decision be superseded once, and the stamp cannot move', () => {
    const driver = fresh();
    record(driver);

    expect(() =>
      driver.run(
        `UPDATE memory_records SET status = 'superseded', superseded_by = 'd-0002', valid_to = ? WHERE id = 'd-0001'`,
        [STAMP],
      ),
    ).not.toThrow();

    abortsWith(
      driver,
      "UPDATE memory_records SET superseded_by = 'd-0003' WHERE id = 'd-0001'",
      [],
      'memory_immutable',
    );

    abortsWith(
      driver,
      "UPDATE memory_records SET valid_to = '2030-01-01' WHERE id = 'd-0001'",
      [],
      'memory_immutable',
    );
  });

  it('aborts every other (kind, status) move, and a supersede without its stamps', () => {
    const states = MemoryKind.options.flatMap((kind) =>
      MemoryStatus.options.map((status) => ({ kind, status })),
    );

    const legal = (
      from: { kind: string; status: string },
      to: { kind: string; status: string },
    ): boolean =>
      (from.kind === 'proposal' &&
        from.status === 'pending' &&
        ((to.kind === 'decision' && to.status === 'active') ||
          (to.kind === 'rejected' && to.status === 'rejected'))) ||
      (from.kind === 'decision' &&
        from.status === 'active' &&
        to.kind === 'decision' &&
        to.status === 'superseded');

    let checked = 0;
    for (const from of states) {
      for (const to of states) {
        if (from === to || (from.kind === to.kind && from.status === to.status)) {
          continue;
        }

        const driver = fresh();
        record(driver, 'x-0001', from);

        // A legal supersede is only legal with both stamps; all other legal moves need none.
        if (legal(from, to) && to.status !== 'superseded') {
          expect(() =>
            driver.run('UPDATE memory_records SET kind = ?, status = ? WHERE id = ?', [
              to.kind,
              to.status,
              'x-0001',
            ]),
          ).not.toThrow();
        } else {
          abortsWith(
            driver,
            'UPDATE memory_records SET kind = ?, status = ? WHERE id = ?',
            [to.kind, to.status, 'x-0001'],
            'memory_illegal_transition',
          );
        }

        checked += 1;
      }
    }

    expect(checked).toBe(16 * 15);
    // 240 trigger probes: 12.7 s alone, over the 20 s default when the whole suite runs in parallel.
  }, 60_000);

  it('aborts events and versions on update and on delete, and the same for records, tags and links', () => {
    const driver = fresh();
    record(driver);
    driver.run(
      "INSERT INTO memory_tags (project, id, tag) VALUES ('forge', 'd-0001', 't')",
    );

    driver.run(
      "INSERT INTO memory_links (project, from_id, rel, target_kind, target) VALUES ('forge', 'd-0001', 'cites', 'record', 'd-0002')",
    );

    driver.run(
      "INSERT INTO memory_events (project, id, at, actor, event) VALUES ('forge', 'd-0001', ?, 'u', 'decided')",
      [STAMP],
    );

    driver.run(
      "INSERT INTO memory_aid_versions (project, id, version, at, actor, aliases, pinned) VALUES ('forge', 'd-0001', 1, ?, 'u', '', 0)",
      [STAMP],
    );

    abortsWith(driver, "UPDATE memory_events SET actor = 'x'", [], 'memory_immutable');
    abortsWith(
      driver,
      'UPDATE memory_aid_versions SET pinned = 1',
      [],
      'memory_immutable',
    );

    for (const table of [
      'memory_events',
      'memory_aid_versions',
      'memory_tags',
      'memory_links',
      'memory_records',
    ]) {
      abortsWith(driver, `DELETE FROM ${table}`, [], 'memory_immutable');
    }
  });

  it('allows deletes only while the purge guard holds a row', () => {
    const driver = fresh();
    record(driver);
    driver.run(
      "INSERT INTO memory_tags (project, id, tag) VALUES ('forge', 'd-0001', 't')",
    );

    driver.run(
      "INSERT INTO memory_events (project, id, at, actor, event) VALUES ('forge', 'd-0001', ?, 'u', 'decided')",
      [STAMP],
    );

    driver.run("INSERT INTO memory_purge_guard (project) VALUES ('forge')");
    driver.run('DELETE FROM memory_events');
    driver.run('DELETE FROM memory_tags');
    driver.run('DELETE FROM memory_records');
    driver.run('DELETE FROM memory_purge_guard');

    expect(driver.get<{ n: number }>('SELECT COUNT(*) AS n FROM memory_records')?.n).toBe(
      0,
    );

    record(driver, 'd-0002');
    abortsWith(driver, 'DELETE FROM memory_records', [], 'memory_immutable');
  });
});
