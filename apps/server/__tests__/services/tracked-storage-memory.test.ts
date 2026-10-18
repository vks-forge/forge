/**
 * Tracked storage for memory writes: the live memory screen.
 *
 * Why: the memory screen (the list, a record, the import banner) must update within a second of any change,
 *   from whichever writer made it (the Director's writer, an approval from the screen, an import at start),
 *   without any writer remembering to notify (d-0132). Wrapping the one storage port announces
 *   `["memory", slug]` after a committed record, move, search-aid or import-attempt write, and nothing for a
 *   read, an access-log row or a transaction that rolled back. Memory is keyed by the project slug itself.
 *
 * Pins: insert, move, aids and import announce the memory key for the slug and no other, an access-log row and
 *   a read announce nothing, a rollback announces nothing.
 * Depends on: src/services/{tracked-storage,project-events}, @forge/db, @forge/memory, vitest.
 */

import { createMemoryStorage } from '@forge/db';
import { createSqlProjectMemory } from '@forge/memory';
import { describe, expect, it } from 'vitest';
import { createProjectEvents } from '#/services/project-events.js';
import { trackProjectWrites } from '#/services/tracked-storage.js';

const source = { type: 'chat', ref: 'owner' } as const;

function setup() {
  const events = createProjectEvents();
  const seen: string[][] = [];
  events.subscribe('shop', (keys) => seen.push(keys.map((k) => k.join(':'))));
  const other: string[][] = [];
  events.subscribe('other', (keys) => other.push(keys.map((k) => k.join(':'))));
  const storage = trackProjectWrites(createMemoryStorage(), events);
  let ms = Date.parse('2026-10-18T10:00:00Z');
  const memory = createSqlProjectMemory({ storage, now: () => new Date((ms += 1000)) });

  return { storage, memory, seen, other };
}

describe('memory writes', () => {
  it('announce the memory key of the slug for a new record, a move, a search-aid change and an import attempt', async () => {
    const { storage, memory, seen, other } = setup();

    await memory.writer.propose('shop', { statement: 'Use zod', source });
    await memory.writer.approve('shop', 'x-0001', 'vikash');
    await storage.transaction((tx) =>
      tx.memory.setAids(
        'shop',
        'x-0001',
        { gist: 'g', aliases: [], pinned: true },
        'a',
        '2026-10-18T10:05:00.000Z',
      ),
    );

    await storage.transaction((tx) =>
      tx.memory.saveImport('shop', {
        attempt: 1,
        at: '2026-10-18T10:06:00.000Z',
        state: 'verified',
        head_sha: null,
        files: 0,
        imported: 0,
        lenient: 0,
        rejects: [],
        backup_path: null,
        verified_at: null,
        repo_deleted_at: null,
        message: null,
      }),
    );

    expect(seen).toEqual([
      ['memory:shop'],
      ['memory:shop'],
      ['memory:shop'],
      ['memory:shop'],
    ]);

    expect(other).toEqual([]);
  });

  it('announce nothing for a read or an access-log row', async () => {
    const { storage, memory, seen } = setup();
    await memory.writer.decide('shop', { statement: 'Use zod', source });
    seen.length = 0;

    await storage.transaction(async (tx) => {
      await tx.memory.get('shop', 'd-0001');
      await tx.memory.list('shop');
      await tx.memory.appendAccess('shop', {
        at: '2026-10-18T10:00:00.000Z',
        actor: 'worker',
        tool: 'search',
        query: 'x',
        terms: ['x'],
        filters: {},
        hit_ids: [],
        total: 0,
        ids: null,
        run_id: null,
        ticket_id: null,
      });
    });

    expect(seen).toEqual([]);
  });

  it('announce nothing when the transaction rolls back', async () => {
    const { storage, seen } = setup();

    await expect(
      storage.transaction(async (tx) => {
        await tx.memory.insertRecord(
          {
            project: 'shop',
            id: 'd-0001',
            kind: 'decision',
            status: 'active',
            statement: 'Lost',
            body: '',
            source_type: 'chat',
            source_ref: 'x',
            author: 'user',
            origin: 'owner',
            confidence: null,
            created_at: 't',
            valid_from: 't',
            valid_to: null,
            superseded_by: null,
            pinned: false,
            approved_at: null,
            approved_by: null,
            rejected_at: null,
            rejected_by: null,
            rejected_reason: null,
            gist: null,
            aliases: [],
            imported_from: null,
            raw_front_matter: null,
            lenient_fields: null,
          },
          [],
          [],
          {
            at: 't',
            actor: 'o',
            event: 'decided',
            from_status: null,
            to_status: 'active',
            reason: null,
          },
        );

        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(seen).toEqual([]);
  });
});
