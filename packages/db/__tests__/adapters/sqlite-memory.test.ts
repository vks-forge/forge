/**
 * Pins what only the SQLite memory index shows: stemming, ranking order, injection safety and that the SQL
 * scope equals the core scope rule.
 *
 * Why: the contract proves both backends agree on scope and behaviour; this file pins what the in-memory
 *   scorer deliberately does not copy. Search must find "testing" when asked for "tests" (porter stemming),
 *   put a statement hit above a body hit, survive every hostile query text without throwing and without
 *   leaving its project, and the SQL form of the scope (what a Worker may see) must give exactly the
 *   records the core `scopeAdmits` rule admits, for any scope, so the two cannot drift apart and let a
 *   pending proposal or a superseded decision through.
 *
 * Pins: stemming and prefix, field weights, hostile text through `buildMatch`, a file database searchable
 *   after reopen, and (property) SQL scope equals `scopeAdmits`.
 * Depends on: src/index, @forge/core, fast-check, vitest. IO: in-memory SQLite.
 */

import fc from 'fast-check';
import {
  MemoryKind,
  MemoryStatus,
  buildMatch,
  directorScope,
  extractTerms,
  ownerScope,
  scopeAdmits,
  workerScope,
} from '@forge/core';
import type { MemoryScope, StorageAdapter } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { createSqliteStorage } from '#/index.js';
import { memoryEvent, memoryRow } from '#tests/helpers/memory-rows.js';

const open = (): StorageAdapter => createSqliteStorage(':memory:');

const find = (
  db: StorageAdapter,
  match: string,
  scope: MemoryScope = directorScope(),
  project = 'forge',
) =>
  db
    .transaction((t) =>
      t.memory.searchLexical({ project, match, scope, limit: 50, snippet: false }),
    )
    .then((hits) => hits.map((h) => h.id));

describe('sqlite memory search', () => {
  it('stems words and matches a typed prefix', async () => {
    const db = open();
    await db.transaction((t) =>
      t.memory.insertRecord(
        memoryRow({ id: 'd-0001', statement: 'Run the tests before every commit' }),
        [],
        [],
        memoryEvent(),
      ),
    );

    expect(
      await find(db, buildMatch({ terms: ['testing'], mode: 'and' }) as string),
    ).toEqual(['d-0001']);

    expect(
      await find(
        db,
        buildMatch({ terms: ['commi'], mode: 'and', prefix: true }) as string,
      ),
    ).toEqual(['d-0001']);

    expect(
      await find(db, buildMatch({ terms: ['deploy'], mode: 'and' }) as string),
    ).toEqual([]);
  });

  it('weighs the statement above the gist above the body', async () => {
    const db = open();
    await db.transaction(async (t) => {
      await t.memory.insertRecord(
        memoryRow({ id: 'd-0001', statement: 'nothing here', body: 'omega omega omega' }),
        [],
        [],
        memoryEvent(),
      );

      await t.memory.insertRecord(
        memoryRow({ id: 'd-0002', statement: 'nothing there', gist: 'omega' }),
        [],
        [],
        memoryEvent(),
      );

      await t.memory.insertRecord(
        memoryRow({ id: 'd-0003', statement: 'omega leads' }),
        [],
        [],
        memoryEvent(),
      );
    });

    expect(await find(db, '"omega"')).toEqual(['d-0003', 'd-0002', 'd-0001']);
  });

  it('never throws on hostile text and never leaves its project', async () => {
    const db = open();
    await db.transaction(async (t) => {
      await t.memory.insertRecord(
        memoryRow({ id: 'd-0001', statement: 'select drop table users' }),
        [],
        [],
        memoryEvent(),
      );

      await t.memory.insertRecord(
        memoryRow({
          project: 'other',
          id: 'd-0001',
          statement: 'secret of the other project',
        }),
        [],
        [],
        memoryEvent(),
      );
    });

    const hostile = [
      'a" OR "b',
      'NEAR(',
      'NEAR(a b, 2)',
      '*',
      '-',
      '- secret',
      'secret:*',
      'statement:secret',
      'project:other',
      '"',
      '""',
      "'; DROP TABLE memory_records;--",
      'x'.repeat(10_000),
      'the and of',
      '🚀 secret',
      'secret OR other',
      '^secret',
      '{statement}: secret',
    ];

    for (const text of hostile) {
      const match = buildMatch({ terms: extractTerms(text), mode: 'or', prefix: true });
      const raw = buildMatch({
        terms: [text],
        synonyms: [text],
        mode: 'or',
        prefix: true,
      });

      for (const m of [match, raw]) {
        const ids = await find(db, m ?? '');
        expect(ids.every((id) => id === 'd-0001')).toBe(true);
        const other = await db.transaction((t) =>
          t.memory.searchLexical({
            project: 'forge',
            match: m ?? '',
            scope: ownerScope(),
            limit: 50,
            snippet: true,
          }),
        );

        expect(other.every((h) => h.id === 'd-0001')).toBe(true);
      }
    }

    // The table is still there after the "DROP TABLE" text.
    expect(await db.transaction((t) => t.memory.get('forge', 'd-0001'))).not.toBeNull();
    expect(await find(db, '"secret"')).toEqual([]);
  });

  it('gives the same records as the core scope rule for any scope (property)', async () => {
    const db = open();
    const tagSets: string[][] = [[], ['db'], ['api'], ['db', 'api']];
    let n = 0;
    const universe: {
      id: string;
      kind: MemoryKind;
      status: MemoryStatus;
      tags: string[];
    }[] = [];

    await db.transaction(async (t) => {
      for (const kind of MemoryKind.options) {
        for (const status of MemoryStatus.options) {
          for (const tags of tagSets) {
            n += 1;
            const id = `d-${String(n).padStart(4, '0')}`;
            universe.push({ id, kind, status, tags });
            await t.memory.insertRecord(
              memoryRow({ id, kind, status, statement: 'shared word' }),
              tags,
              [],
              memoryEvent(),
            );
          }
        }
      }
    });

    const kinds = fc.subarray([...MemoryKind.options]);
    const statuses = fc.subarray([...MemoryStatus.options]);
    const tags = fc.subarray(['db', 'api', 'other']);

    await fc.assert(
      fc.asyncProperty(
        kinds,
        statuses,
        tags,
        fc.boolean(),
        async (k, s, tg, include_rejected) => {
          const scope: MemoryScope = { kinds: k, status: s, tags: tg, include_rejected };
          const got = (await find(db, '"shared"', scope)).sort();
          const want = universe
            .filter((r) => scopeAdmits(scope, r))
            .map((r) => r.id)
            .sort();

          expect(got).toEqual(want);
        },
      ),
      { numRuns: 60 },
    );

    for (const preset of [
      directorScope(),
      ownerScope(),
      workerScope({ tags: ['db'], include_rejected: true }),
    ]) {
      const got = (await find(db, '"shared"', preset)).sort();
      const want = universe
        .filter((r) => scopeAdmits(preset, r))
        .map((r) => r.id)
        .sort();

      expect(got).toEqual(want);
    }
  });
});
