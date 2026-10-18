/**
 * A project memory of seventy records for the search tests: named targets and neutral filler.
 *
 * Why: search quality is only meaningful against a corpus with something to confuse it. Ten records carry the
 *   words a Worker or the Director would really look for (test-first, WAL, idempotent webhooks, secrets), and
 *   sixty fillers share one small vocabulary of unrelated words so they match each other and never a target
 *   by accident. Records are written through the repository (not the writer) so tests can set kind, status,
 *   tags, pinned and created date directly.
 *
 * Exports: seedCorpus(), put(), TARGETS, NOW.
 * Depends on: @forge/core. IO only through the storage given.
 */

import type { MemoryLink, MemoryRow, StorageAdapter } from '@forge/core';

export const NOW = new Date('2026-10-18T12:00:00.000Z');

const FILLER_WORDS = [
  'zebra',
  'quartz',
  'lantern',
  'meadow',
  'harbor',
  'pillow',
  'velvet',
  'copper',
  'thistle',
  'marble',
];

/** Targets with the keywords an agent would type to find them. */
export const TARGETS = [
  {
    id: 'd-0101',
    statement:
      'Every major workflow goes through red-green TDD: a failing test is written and seen to fail before the implementation.',
    tags: ['practice'],
    query: 'tdd red green',
  },
  {
    id: 'd-0102',
    statement:
      'Run the SQLite database in WAL mode with synchronous FULL so a crash never loses an acknowledged commit.',
    tags: ['db'],
    query: 'sqlite wal',
  },
  {
    id: 'd-0103',
    statement: 'Webhook intake must be idempotent per source and dedupe key.',
    tags: ['intake'],
    query: 'webhook idempotent',
  },
  {
    id: 'd-0104',
    statement:
      'Secrets live in the operating system secret store and never in the database or the repository.',
    tags: ['security'],
    query: 'secrets store',
  },
  {
    id: 'd-0105',
    statement: 'The Director never merges a branch that a reviewer marked critical.',
    tags: ['review'],
    query: 'director merges critical',
  },
  {
    id: 'd-0106',
    statement: 'Lanes decide how much process a ticket gets: express, standard or full.',
    tags: ['lanes'],
    query: 'lanes process',
  },
  {
    id: 'd-0107',
    statement:
      'Every Worker runs inside its own git worktree and never in the main checkout.',
    tags: ['workers'],
    query: 'worker worktree',
  },
  {
    id: 'd-0108',
    statement: 'Tool calls pass one admit function that denies by default.',
    tags: ['policy'],
    query: 'admit denies',
  },
  {
    id: 'd-0109',
    statement:
      'Settings are versioned rows edited through the interface, never hand-edited files.',
    tags: ['config'],
    query: 'settings versioned',
  },
  {
    id: 'd-0110',
    statement:
      'Cards group the tickets of one request and own the plan the owner approved.',
    tags: ['cards'],
    query: 'cards plan approved',
  },
] as const;

export interface PutOptions {
  readonly kind?: MemoryRow['kind'];
  readonly status?: MemoryRow['status'];
  readonly tags?: readonly string[];
  readonly links?: readonly MemoryLink[];
  readonly pinned?: boolean;
  readonly body?: string;
  readonly gist?: string | null;
  readonly aliases?: readonly string[];
  readonly created_at?: string;
  readonly project?: string;
  readonly superseded_by?: string | null;
}

/** Inserts one record straight into storage; `status` and `kind` may be any pair a test needs. */
export async function put(
  storage: StorageAdapter,
  id: string,
  statement: string,
  o: PutOptions = {},
): Promise<void> {
  const kind = o.kind ?? 'decision';
  const status =
    o.status ??
    (kind === 'proposal' ? 'pending' : kind === 'rejected' ? 'rejected' : 'active');

  const at = o.created_at ?? '2026-10-10T00:00:00.000Z';

  await storage.transaction((tx) =>
    tx.memory.insertRecord(
      {
        project: o.project ?? 'forge',
        id,
        kind,
        status,
        statement,
        body: o.body ?? '',
        source_type: 'chat',
        source_ref: 'the owner',
        author: kind === 'proposal' ? 'director' : 'user',
        origin: kind === 'proposal' ? 'agent' : 'owner',
        confidence: null,
        created_at: at,
        valid_from: at.slice(0, 10),
        valid_to: status === 'superseded' ? at : null,
        superseded_by: o.superseded_by ?? null,
        pinned: o.pinned ?? false,
        approved_at: null,
        approved_by: null,
        rejected_at: null,
        rejected_by: null,
        rejected_reason: null,
        gist: o.gist ?? null,
        aliases: [...(o.aliases ?? [])],
        imported_from: null,
        raw_front_matter: null,
        lenient_fields: null,
      },
      o.tags ?? [],
      [...(o.links ?? [])],
      {
        at,
        actor: 'owner',
        event: 'decided',
        from_status: null,
        to_status: status,
        reason: null,
      },
    ),
  );
}

/** The ten targets and sixty fillers of project `forge`. */
export async function seedCorpus(storage: StorageAdapter): Promise<void> {
  for (const t of TARGETS) {
    await put(storage, t.id, t.statement, { tags: t.tags });
  }

  for (let i = 1; i <= 60; i += 1) {
    const a = FILLER_WORDS[i % FILLER_WORDS.length];
    const b = FILLER_WORDS[(i * 3 + 1) % FILLER_WORDS.length];
    await put(
      storage,
      `d-${String(200 + i).padStart(4, '0')}`,
      `Filler note ${i} about ${a} and ${b}.`,
      {
        tags: ['filler', `group${i % 5}`],
        created_at: `2026-09-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
      },
    );
  }
}
