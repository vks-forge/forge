/**
 * Record file codec tests — what goes on disk is what comes back.
 *
 * Why: the Director plans against these files and the owner reads their git diffs. A
 *   statement with a colon, quote or line break must survive a write and a read unchanged,
 *   hand-added fields must not be dropped by a rewrite, and a file that fails the schema
 *   must be refused rather than half-read.
 *
 * Pins: renderRecordFile/parseRecordFile round trip, field order, unknown fields kept,
 *   rejection of bad files, recordFileName.
 * Depends on: domain/record-file, @forge/core (MemoryRecord type). No IO.
 */

import type { MemoryRecord } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  parseRecordFile,
  recordFileName,
  renderRecordFile,
} from '#/domain/record-file.js';

const base: MemoryRecord = {
  id: 'd-0001',
  kind: 'decision',
  statement: 'Use SQLite: it ships with Node, "no server" needed.\nSecond line.',
  source: { type: 'chat', ref: 'the owner said "ok": go' },
  author: 'user',
  origin: 'owner',
  status: 'active',
  valid_from: '2026-10-15T10:00:00.000Z',
  superseded_by: null,
  supersedes: null,
  tags: ['db', 'storage'],
  pinned: true,
};

describe('record file codec', () => {
  it('round-trips colons, quotes and line breaks in text fields', () => {
    const text = renderRecordFile(base, 'Why: because.\n\nMore.');
    const parsed = parseRecordFile(text);

    expect(parsed).toEqual({ ok: true, record: base, body: 'Why: because.\n\nMore.' });
  });

  it('writes the identity fields first, in a stable order', () => {
    const lines = renderRecordFile(base, '').split('\n');

    expect(lines[0]).toBe('---');
    expect(lines.slice(1, 4).map((l) => l.split(':')[0])).toEqual([
      'id',
      'kind',
      'statement',
    ]);
  });

  it('keeps a hand-added field through a rewrite', () => {
    const withExtra = { ...base, amends: ['d-0007'] } as MemoryRecord;
    const parsed = parseRecordFile(renderRecordFile(withExtra, ''));

    expect(parsed.ok && (parsed.record as Record<string, unknown>)['amends']).toEqual([
      'd-0007',
    ]);
  });

  it('omits the body section when the body is empty', () => {
    expect(renderRecordFile(base, '  \n')).toMatch(/---\n$/);
  });

  it.each([
    ['no front matter', 'just text'],
    ['a missing field', '---\nid: d-0001\nstatement: x\n---\n'],
    [
      'an author outside user and director',
      renderRecordFile({ ...base, author: 'robot' } as unknown as MemoryRecord, ''),
    ],
  ])('refuses %s', (_name, text) => {
    expect(parseRecordFile(text).ok).toBe(false);
  });

  it('names files after the id and the first words of the statement', () => {
    expect(recordFileName('x-0012', 'Use "pnpm" -- not npm!')).toBe(
      'x-0012-use-pnpm-not-npm.md',
    );

    expect(recordFileName('x-0001', '???')).toBe('x-0001.md');
    expect(recordFileName('d-0002', 'a'.repeat(100)).length).toBeLessThanOrEqual(60);
  });
});
