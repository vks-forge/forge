/**
 * Test data: sample project memory records.
 *
 * Why: the memory screen has four tabs, a supersede chain, pending proposals that change
 *   state when answered, and a list long enough to need windowing. None of that can be
 *   designed or tested against an empty store, so this seeds one of each: active, superseded
 *   (with its successor) and pinned decisions, rejected approaches with reasons, Director
 *   proposals under the 0.8 confidence cap, and 130 outcomes. Every record says it is
 *   sample data in its source, rows are parsed with the real core schema, and nothing names
 *   a real repository.
 *
 * Exports: memoryData().
 * Depends on: @forge/core (MemoryRecordWithBody).
 */

import { MemoryRecordWithBody } from '@forge/core';

const FIXTURE = { type: 'fixture', ref: 'sample data for component tests' };

function owner(row: Record<string, unknown>) {
  return {
    kind: 'decision',
    author: 'user',
    origin: 'owner',
    status: 'active',
    source: FIXTURE,
    valid_from: '2026-08-02',
    ...row,
  };
}

function proposal(row: Record<string, unknown>) {
  return {
    kind: 'proposal',
    author: 'director',
    origin: 'agent',
    status: 'pending',
    source: { type: 'run', ref: 'sample run SVC-14 (fixture)' },
    valid_from: '2026-10-12',
    ...row,
  };
}

const BASE = [
  owner({
    id: 'd-0001',
    statement: 'Every ticket is verified by the project checks before it can merge.',
    tags: ['gates', 'quality'],
    pinned: true,
    body: 'The gates run the checks by role (test, lint, typecheck, build). A red check blocks merge; there is no override.',
  }),
  owner({
    id: 'd-0002',
    statement: 'Use pnpm workspaces; never npm or yarn in this repository.',
    tags: ['tooling'],
    body: 'Lockfile is pnpm-lock.yaml. Workers must not create package-lock.json.',
  }),
  owner({
    id: 'd-0003',
    statement: 'Run the full test suite on every ticket.',
    status: 'superseded',
    superseded_by: 'd-0006',
    valid_to: '2026-09-20',
    tags: ['gates', 'tests'],
    body: 'Replaced once the suite grew past ten minutes.',
  }),
  owner({
    id: 'd-0004',
    statement: 'Public API changes need an owner-approved ticket (Tier C).',
    tags: ['api', 'policy'],
    body: 'Anything under src/api or the OpenAPI file is Tier C regardless of triage.',
  }),
  owner({
    id: 'd-0005',
    statement: 'Database migrations are written forward-only, with a rollback note.',
    tags: ['database'],
    body: 'No down migrations. The note says how to recover by hand.',
  }),
  owner({
    id: 'd-0006',
    statement:
      'Run only the tests affected by the diff on a ticket; the full suite runs after merge.',
    supersedes: 'd-0003',
    valid_from: '2026-09-20',
    tags: ['gates', 'tests'],
    body: 'Keeps the ticket loop under three minutes. The post-merge run still catches cross-package breaks.',
  }),
  {
    ...owner({}),
    id: 'r-0001',
    kind: 'rejected',
    status: 'rejected',
    statement: 'Let Workers push directly to the base branch.',
    rejected_reason:
      'Every change must pass a pull request so the gates and a human can see it.',
    rejected_at: '2026-08-15',
    rejected_by: 'owner',
    tags: ['git'],
    body: 'Rejected during onboarding.',
  },
  {
    ...owner({}),
    id: 'r-0002',
    kind: 'rejected',
    status: 'rejected',
    statement: 'Auto-merge tickets the Director rates above 0.9 confidence.',
    rejected_reason:
      'Confidence is a guess, not a gate. Merging stays an explicit policy path.',
    rejected_at: '2026-09-03',
    rejected_by: 'owner',
    tags: ['policy', 'gates'],
    body: 'May be reopened if gate history shows no escapes for a quarter.',
  },
  proposal({
    id: 'x-0001',
    statement: 'Prefer Vitest over Jest for new test files in this project.',
    confidence: 0.7,
    tags: ['tests', 'tooling'],
    body: 'Inferred from the last six merged tickets, which all added Vitest files.',
  }),
  proposal({
    id: 'x-0002',
    statement: 'Treat files under migrations/ as Tier C.',
    confidence: 0.6,
    tags: ['database', 'policy'],
    body: 'Two Workers edited a migration this month; neither was reviewed as Tier C.',
  }),
  proposal({
    id: 'x-0003',
    statement: 'Keep commit messages in the imperative mood, one line.',
    confidence: 0.8,
    tags: ['git'],
    body: 'Matches the last 40 commits on the base branch.',
  }),
];

function outcomes() {
  return Array.from({ length: 130 }, (_, index) => {
    const n = index + 1;
    const day = String((index % 28) + 1).padStart(2, '0');

    return {
      id: `o-${String(n).padStart(4, '0')}`,
      kind: 'outcome',
      author: 'director',
      origin: 'system',
      status: 'active',
      source: { type: 'ticket', ref: `SVC-${n} (fixture)` },
      valid_from: `2026-09-${day}`,
      statement: `SVC-${n} merged after ${(n % 3) + 1} verification run${n % 3 === 0 ? 's' : ''}.`,
      tags: n % 5 === 0 ? ['rework'] : ['merged'],
      body: 'Sample outcome generated for component tests.',
    };
  });
}

/** A fresh, mutable copy of the sample records: the stubbed route edits them when a proposal is answered. */
export function memoryData(): MemoryRecordWithBody[] {
  return [...BASE, ...outcomes()].map((row) => MemoryRecordWithBody.parse(row));
}
