/**
 * Test data: the memory API's richer replies built from the sample records.
 *
 * Why: the record page, search and import banner are tested over the stubbed server, which must
 *   answer in the real shapes (`MemoryRecordView`, `MemorySearchReply`, history, related,
 *   import status) or the screens would be tested against something the server never sends. This
 *   derives each reply from the one sample store so an approved proposal shows up in search and
 *   on its record page too, and parses every reply with the real core schema so a fixture that
 *   drifts from the contract fails here, loudly. Search is a plain word match, not the server's
 *   ranking: it exists to give the screen hits with marks, a replaced decision's successor and
 *   paging, not to test relevance.
 *
 * Exports: toView(), searchReply(), relatedFor(), historyFor(), notImported(), IMPORT_VERIFIED.
 * Depends on: @forge/core (schemas).
 */

import {
  MemoryEvent,
  MemoryImportStatus,
  MemoryRecordView,
  MemoryRelated,
  MemorySearchReply,
} from '@forge/core';
import type { MemoryRecordWithBody } from '@forge/core';

export const notImported = MemoryImportStatus.parse({
  state: 'not_needed',
  head_sha: null,
  files: 0,
  imported: 0,
  lenient: 0,
  rejects: [],
  verified_at: null,
  backup_path: null,
  repo_deleted_at: null,
  message: null,
});

export const IMPORT_VERIFIED = MemoryImportStatus.parse({
  ...notImported,
  state: 'verified',
  head_sha: 'a1b2c3d',
  files: 201,
  imported: 201,
  verified_at: '2026-10-18T09:00:00.000Z',
  backup_path: 'C:/forge-data/backups/pre-memory-db-20261018T085900Z',
  repo_deleted_at: '2026-10-18T09:00:01.000Z',
});

export function toView(row: MemoryRecordWithBody): MemoryRecordView {
  return MemoryRecordView.parse({
    id: row.id,
    kind: row.kind,
    status: row.status,
    statement: row.statement,
    body: row.body,
    body_truncated: false,
    tags: row.tags,
    source: row.source,
    author: row.author,
    origin: row.origin,
    confidence: row.confidence ?? null,
    pinned: row.pinned ?? false,
    valid_from: row.valid_from,
    valid_to: row.valid_to ?? null,
    supersedes: row.supersedes ?? null,
    superseded_by: row.superseded_by ?? null,
    ...(row.approved_at ? { approved_at: row.approved_at } : {}),
    ...(row.approved_by ? { approved_by: row.approved_by } : {}),
    ...(row.rejected_at ? { rejected_at: row.rejected_at } : {}),
    ...(row.rejected_by ? { rejected_by: row.rejected_by } : {}),
    ...(row.rejected_reason ? { rejected_reason: row.rejected_reason } : {}),
    gist: null,
    aliases: [],
    links: row.supersedes
      ? [{ rel: 'supersedes', target_kind: 'record', target: row.supersedes }]
      : [],
    imported: null,
  });
}

function marksOf(text: string, words: readonly string[]): [number, number][] {
  const lower = text.toLowerCase();

  return words.flatMap((word): [number, number][] => {
    const at = lower.indexOf(word);

    return at < 0 ? [] : [[at, at + word.length]];
  });
}

/** A plain word match over id, statement, body and tags, with the real reply shape. */
export function searchReply(
  records: readonly MemoryRecordWithBody[],
  query: URLSearchParams,
): MemorySearchReply {
  const words = (query.get('q') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const kinds = query.getAll('kind');
  const statuses = query.getAll('status');
  const tags = query.getAll('tag');
  const withSuperseded = query.get('superseded') === '1';
  const k = Number(query.get('k') ?? 10);
  const offset = Number(query.get('offset') ?? 0);

  const matched = records.filter((row) => {
    const hay =
      `${row.id} ${row.statement} ${row.body} ${row.tags.join(' ')}`.toLowerCase();

    return (
      row.kind !== 'outcome' &&
      words.every((word) => hay.includes(word)) &&
      (kinds.length === 0 || kinds.includes(row.kind)) &&
      (statuses.length === 0 || statuses.includes(row.status)) &&
      tags.every((tag) => row.tags.includes(tag)) &&
      (withSuperseded || row.status !== 'superseded' || row.superseded_by !== undefined)
    );
  });

  const seen = new Set<string>();
  const hits = matched.flatMap((row) => {
    const successor =
      !withSuperseded && row.status === 'superseded' && row.superseded_by
        ? records.find((r) => r.id === row.superseded_by)
        : undefined;

    const shown = successor ?? row;
    if (seen.has(shown.id)) {
      return [];
    }

    seen.add(shown.id);

    return [
      {
        id: shown.id,
        kind: shown.kind,
        status: shown.status,
        line: shown.statement.slice(0, 160),
        tags: shown.tags,
        why: 'statement' as const,
        score: 1 / (seen.size + 1),
        snippet: {
          text: shown.statement.slice(0, 200),
          marks: marksOf(shown.statement.slice(0, 200), words),
        },
        ...(successor ? { replaced_by: row.id } : {}),
      },
    ];
  });

  return MemorySearchReply.parse({
    hits: hits.slice(offset, offset + k),
    total: hits.length,
    truncated: false,
  });
}

export function relatedFor(
  records: readonly MemoryRecordWithBody[],
  id: string,
): MemoryRelated[] {
  const self = records.find((row) => row.id === id);
  if (!self) {
    return [];
  }

  return records
    .filter((row) => row.id !== id && row.kind !== 'outcome')
    .flatMap((row) => {
      const reasons: string[] = [];
      if (self.supersedes === row.id) {
        reasons.push('supersedes');
      }

      if (self.superseded_by === row.id) {
        reasons.push('superseded by');
      }

      const shared = row.tags.filter((tag) => self.tags.includes(tag));
      if (shared.length > 0) {
        reasons.push(`shares tags: ${shared.join(', ')}`);
      }

      return reasons.length === 0
        ? []
        : [
            MemoryRelated.parse({
              id: row.id,
              kind: row.kind,
              status: row.status,
              line: row.statement.slice(0, 140),
              reasons: reasons.slice(0, 3),
            }),
          ];
    })
    .slice(0, 5);
}

export function historyFor(row: MemoryRecordWithBody): {
  events: MemoryEvent[];
  versions: never[];
} {
  const proposed = row.kind === 'proposal' || row.author === 'director';
  const events = [
    MemoryEvent.parse({
      seq: 1,
      id: row.id,
      at: `${row.valid_from}T09:00:00.000Z`,
      actor: row.author === 'user' ? 'owner' : 'director',
      event: proposed ? 'proposed' : 'decided',
      from_status: null,
      to_status: proposed ? 'pending' : 'active',
      reason: null,
    }),
  ];

  if (row.status === 'active' && proposed) {
    events.push(
      MemoryEvent.parse({
        seq: 2,
        id: row.id,
        at: `${row.approved_at ?? row.valid_from}T10:00:00.000Z`,
        actor: 'owner',
        event: 'approved',
        from_status: 'pending',
        to_status: 'active',
        reason: null,
      }),
    );
  }

  if (row.status === 'superseded') {
    events.push(
      MemoryEvent.parse({
        seq: 2,
        id: row.id,
        at: `${row.valid_to ?? row.valid_from}T10:00:00.000Z`,
        actor: 'owner',
        event: 'superseded',
        from_status: 'active',
        to_status: 'superseded',
        reason: `Replaced by ${row.superseded_by ?? 'a newer decision'}`,
      }),
    );
  }

  return { events, versions: [] };
}
