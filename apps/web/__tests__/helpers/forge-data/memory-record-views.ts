/**
 * Test data: a record view and an import status for the record-page tests.
 *
 * Why: several record-page tests need a Director-written decision or a project whose import needs
 *   attention, in the real reply shapes; building them once keeps each test about its behaviour.
 *
 * Exports: view(), needsAttention, rec().
 * Depends on: helpers/fetch-stub.
 */

import { json } from '#tests/helpers/fetch-stub.js';

// A fixed id, so the override never swallows `/memory/import` or `/memory/search`.
export const rec = (id: string) => `GET /projects/:slug/memory/${id}`;

export const view = (extra: Record<string, unknown> = {}) => ({
  id: 'd-0009',
  kind: 'decision',
  status: 'active',
  statement: 'Use feature flags for risky changes.',
  body: 'Flags are removed after one release.',
  body_truncated: false,
  tags: ['release'],
  source: { type: 'run', ref: 'sample run SVC-9' },
  author: 'director',
  origin: 'agent',
  confidence: 0.7,
  pinned: false,
  valid_from: '2026-10-01',
  valid_to: null,
  supersedes: null,
  superseded_by: null,
  approved_at: '2026-10-03',
  approved_by: 'owner',
  gist: null,
  aliases: [],
  links: [],
  imported: null,
  ...extra,
});

export const needsAttention = json({
  state: 'needs_attention',
  head_sha: 'abc',
  files: 10,
  imported: 9,
  lenient: 2,
  rejects: [{ path: 'decisions/d-0042.md', reason: 'no statement' }],
  verified_at: null,
  backup_path: null,
  repo_deleted_at: null,
  message: null,
});
