/**
 * Pins: how memory records are sorted onto tabs and searched, how an answer moves a proposal
 * before the server confirms, and how two settings versions are diffed.
 *
 * Why: the owner trusts the tabs (a rejected approach must never show under Decisions), the
 * optimistic move must match what the real writer does (id kept, kind and status changed),
 * and "what changed in v4?" must read the same in the history list and the conflict banner.
 * Depends on: domain/memory-filter, domain/doc-diff.
 */

import type { MemoryListEntry } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { describeValue, diffDocs } from '#/domain/doc-diff.js';
import {
  applyAnswer,
  countByTab,
  DEFAULT_FILTER,
  filterEntries,
  tagsOf,
} from '#/domain/memory-filter.js';

const entry = (over: Partial<MemoryListEntry>): MemoryListEntry => ({
  id: 'd-0001',
  kind: 'decision',
  status: 'active',
  statement: 'Use pnpm',
  tags: [],
  ...over,
});

const ENTRIES = [
  entry({ id: 'd-0001', tags: ['tooling'] }),
  entry({
    id: 'd-0002',
    status: 'superseded',
    statement: 'Run all tests',
    tags: ['tests'],
  }),
  entry({
    id: 'r-0001',
    kind: 'rejected',
    status: 'rejected',
    statement: 'Push to main',
  }),
  entry({
    id: 'x-0001',
    kind: 'proposal',
    status: 'pending',
    statement: 'Use Vitest',
    tags: ['tests'],
  }),
];

describe('filterEntries', () => {
  it('keeps each kind on its own tab', () => {
    expect(filterEntries(ENTRIES, DEFAULT_FILTER).map((e) => e.id)).toEqual([
      'd-0001',
      'd-0002',
    ]);

    expect(
      filterEntries(ENTRIES, { ...DEFAULT_FILTER, tab: 'rejected' }).map((e) => e.id),
    ).toEqual(['r-0001']);
  });

  it('matches text against id, statement and tags, ignoring case', () => {
    expect(filterEntries(ENTRIES, { ...DEFAULT_FILTER, text: 'ALL TESTS' })).toHaveLength(
      1,
    );

    expect(filterEntries(ENTRIES, { ...DEFAULT_FILTER, text: 'd-0001' })).toHaveLength(1);
    expect(filterEntries(ENTRIES, { ...DEFAULT_FILTER, text: 'tooling' })).toHaveLength(
      1,
    );
  });

  it('requires every chosen tag and can hide superseded decisions', () => {
    expect(filterEntries(ENTRIES, { ...DEFAULT_FILTER, tags: ['tests'] })).toHaveLength(
      1,
    );

    expect(filterEntries(ENTRIES, { ...DEFAULT_FILTER, activeOnly: true })).toHaveLength(
      1,
    );
  });
});

describe('counts, tags and optimistic answers', () => {
  it('counts per tab and lists tags most used first', () => {
    expect(countByTab(ENTRIES)).toEqual({
      decisions: 2,
      rejected: 1,
      proposals: 1,
      outcomes: 0,
    });

    expect(tagsOf(ENTRIES, 'decisions')).toEqual(['tests', 'tooling']);
  });

  it('approve makes a proposal an active decision, reject a rejected record, ids kept', () => {
    const approved = applyAnswer(ENTRIES, { id: 'x-0001', verdict: 'approve' });
    const rejected = applyAnswer(ENTRIES, {
      id: 'x-0001',
      verdict: 'reject',
      reason: 'no',
    });

    expect(approved.find((e) => e.id === 'x-0001')).toMatchObject({
      kind: 'decision',
      status: 'active',
    });

    expect(rejected.find((e) => e.id === 'x-0001')).toMatchObject({
      kind: 'rejected',
      status: 'rejected',
    });

    expect(approved.filter((e) => e.id !== 'x-0001')).toEqual(
      ENTRIES.filter((e) => e.id !== 'x-0001'),
    );
  });

  it('does not touch a record that is not pending', () => {
    expect(applyAnswer(ENTRIES, { id: 'd-0001', verdict: 'approve' })).toEqual(ENTRIES);
  });
});

describe('diffDocs and describeValue', () => {
  it('reports added, changed and removed top-level keys, ignoring key order', () => {
    const changes = diffDocs({ a: 1, b: [1], c: 'x' }, { c: 'y', b: [1], d: true });

    expect(changes.map((c) => `${c.kind}:${c.key}`)).toEqual([
      'removed:a',
      'changed:c',
      'added:d',
    ]);
  });

  it('describes checks as role and command, empty lists as none', () => {
    expect(describeValue([{ name: 't', role: 'test', command: 'pnpm test' }])).toBe(
      'test: pnpm test',
    );

    expect(describeValue([])).toBe('none');
    expect(describeValue(undefined)).toBe('inherited');
  });
});
