/**
 * Pins the memory database schemas: what a stored record, a tool input and a retrieval setting may hold.
 *
 * Why: these shapes are the contract between the database, the importer, the HTTP views and the Worker
 *   tools. A Worker tool input must carry nothing that could widen what a Worker sees (no project, status
 *   or scope field) and must be short, because its schema sits in every Worker session. A stored row must
 *   reject an empty statement and a tag that would break the search index. The Director's retrieval
 *   settings must stay inside bounds that keep a prompt small and a rewrite call cheap, and a rewrite
 *   answer must be a handful of short words.
 *
 * Pins: tag pattern, row validation, tool inputs strict and bounded, proposal confidence cap and the new
 *   optional aids and links, retrieval settings bounds and built-in defaults, rewrite output bounds, the
 *   `memory_rewrite` step and its model, and the import status states.
 * Depends on: src/schemas/*, src/domain/builtin-director, vitest.
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_DIRECTOR_CONFIG } from '#/domain/builtin-director.js';
import { DirectorMemorySettings } from '#/schemas/director-config.js';
import { MemoryRewriteOutput } from '#/schemas/director-steps.js';
import {
  MEMORY_IMPORT_STATES,
  MemoryImportStatus,
  MemoryRow,
  MemoryTag,
} from '#/schemas/memory-db.js';
import {
  MEMORY_NOTICE,
  MemoryGetToolInput,
  MemoryRelatedToolInput,
  MemorySearchToolInput,
  MemoryToolSearchOutput,
} from '#/schemas/memory-db-tools.js';
import { DecisionInput, ProposalInput } from '#/schemas/memory-record.js';
import { STEP_NAMES } from '#/schemas/steps.js';

const row = (over: Record<string, unknown> = {}): unknown => ({
  project: 'forge',
  id: 'd-0001',
  kind: 'decision',
  status: 'active',
  statement: 'Use zod',
  body: '',
  source_type: 'chat',
  source_ref: 'the owner',
  author: 'user',
  origin: 'owner',
  confidence: null,
  created_at: '2026-10-18T00:00:00.000Z',
  valid_from: '2026-10-18',
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
  ...over,
});

describe('MemoryTag', () => {
  it('accepts lower-case words of 1-40 characters and refuses the rest', () => {
    expect(MemoryTag.safeParse('db.schema_v2-x').success).toBe(true);
    expect(MemoryTag.safeParse('Upper').success).toBe(false);
    expect(MemoryTag.safeParse('has space').success).toBe(false);
    expect(MemoryTag.safeParse('a'.repeat(41)).success).toBe(false);
    expect(MemoryTag.safeParse('').success).toBe(false);
  });
});

describe('MemoryRow', () => {
  it('parses a complete row and refuses a blank statement, an unknown field and a bad id', () => {
    expect(MemoryRow.safeParse(row()).success).toBe(true);
    expect(MemoryRow.safeParse(row({ statement: '   ' })).success).toBe(false);
    expect(MemoryRow.safeParse(row({ extra: 1 })).success).toBe(false);
    expect(MemoryRow.safeParse(row({ id: 'd-1' })).success).toBe(false);
  });
});

describe('Worker tool inputs', () => {
  it('carry only keywords, narrowing filters and a count', () => {
    expect(
      MemorySearchToolInput.safeParse({ query: 'tdd', kinds: ['rejected'], k: 3 })
        .success,
    ).toBe(true);

    for (const widen of [
      { query: 'x', project: 'other' },
      { query: 'x', status: ['pending'] },
      { query: 'x', scope: {} },
      { query: 'x', kinds: ['proposal'] },
    ]) {
      expect(MemorySearchToolInput.safeParse(widen).success).toBe(false);
    }
  });

  it('bounds the query, k, ids and tags', () => {
    expect(MemorySearchToolInput.safeParse({ query: '' }).success).toBe(false);
    expect(MemorySearchToolInput.safeParse({ query: 'x'.repeat(201) }).success).toBe(
      false,
    );

    expect(MemorySearchToolInput.safeParse({ query: 'x', k: 16 }).success).toBe(false);
    expect(
      MemorySearchToolInput.safeParse({ query: 'x', tags: Array(9).fill('a') }).success,
    ).toBe(false);

    expect(MemoryGetToolInput.safeParse({ ids: [] }).success).toBe(false);
    expect(
      MemoryGetToolInput.safeParse({ ids: ['d-0001', 'd-0002', 'd-0003', 'd-0004'] })
        .success,
    ).toBe(false);

    expect(MemoryGetToolInput.safeParse({ ids: ['not-an-id'] }).success).toBe(false);
    expect(MemoryRelatedToolInput.safeParse({ id: 'd-0001', k: 6 }).success).toBe(false);
    expect(MemoryRelatedToolInput.safeParse({ id: 'd-0001', k: 5 }).success).toBe(true);
  });

  it('answers open with the notice', () => {
    const out = { notice: MEMORY_NOTICE, hits: [], total: 0, truncated: false };

    expect(MemoryToolSearchOutput.safeParse(out).success).toBe(true);
    expect(MemoryToolSearchOutput.safeParse({ ...out, notice: 'hello' }).success).toBe(
      false,
    );
  });
});

describe('writer inputs', () => {
  const source = { type: 'chat', ref: 'owner' };

  it('keep the 0.8 confidence cap and accept search aids and typed links', () => {
    expect(
      ProposalInput.safeParse({ statement: 's', source, confidence: 0.85 }).success,
    ).toBe(false);

    const ok = ProposalInput.safeParse({
      statement: 's',
      source,
      gist: 'short',
      aliases: ['a', 'b'],
      links: { amends: ['d-0001'], cites: ['d-0002'], card: 'FG-C1', ticket: 'FG-4' },
    });

    expect(ok.success).toBe(true);
    expect(
      DecisionInput.safeParse({ statement: 's', source, aliases: Array(9).fill('a') })
        .success,
    ).toBe(false);

    expect(
      DecisionInput.safeParse({ statement: 's', source, links: { amends: ['nope'] } })
        .success,
    ).toBe(false);
  });
});

describe('retrieval settings', () => {
  it('ships the d-0168 defaults inside the built-in director config', () => {
    expect(BUILTIN_DIRECTOR_CONFIG.memory).toEqual({
      rewrite: true,
      rewrite_timeout_ms: 15_000,
      rewrite_budget_usd: 0.25,
      top_k: 8,
      pinned_max: 12,
      rejected_max: 25,
    });
  });

  it('refuses values outside the bounds', () => {
    const ok = BUILTIN_DIRECTOR_CONFIG.memory;

    expect(DirectorMemorySettings.safeParse(ok).success).toBe(true);
    for (const bad of [
      { rewrite_timeout_ms: 999 },
      { rewrite_timeout_ms: 60_001 },
      { rewrite_budget_usd: -1 },
      { rewrite_budget_usd: 2.5 },
      { top_k: 0 },
      { top_k: 16 },
      { pinned_max: 26 },
      { rejected_max: 4 },
      { rejected_max: 51 },
    ]) {
      expect(DirectorMemorySettings.safeParse({ ...ok, ...bad }).success).toBe(false);
    }
  });
});

describe('memory_rewrite step', () => {
  it('is a step with a timeout, and its answer is a few short words', () => {
    expect(STEP_NAMES).toContain('memory_rewrite');
    expect(BUILTIN_DIRECTOR_CONFIG.step_timeouts_ms.memory_rewrite).toBe(30_000);
    expect(
      MemoryRewriteOutput.safeParse({ terms: ['a'], synonyms: [], tags: [] }).success,
    ).toBe(true);

    expect(
      MemoryRewriteOutput.safeParse({ terms: [], synonyms: [], tags: [] }).success,
    ).toBe(false);

    expect(
      MemoryRewriteOutput.safeParse({ terms: Array(5).fill('a'), synonyms: [], tags: [] })
        .success,
    ).toBe(false);

    expect(
      MemoryRewriteOutput.safeParse({
        terms: ['a'],
        synonyms: ['x'.repeat(41)],
        tags: [],
      }).success,
    ).toBe(false);
  });
});

describe('MemoryImportStatus', () => {
  it('has the four stored states plus not_needed', () => {
    expect([...MEMORY_IMPORT_STATES]).toEqual([
      'pending',
      'verified',
      'needs_attention',
      'failed',
    ]);

    const base = {
      head_sha: null,
      files: 0,
      imported: 0,
      lenient: 0,
      rejects: [],
      verified_at: null,
      backup_path: null,
      repo_deleted_at: null,
      message: null,
    };

    for (const state of ['not_needed', ...MEMORY_IMPORT_STATES]) {
      expect(MemoryImportStatus.safeParse({ ...base, state }).success).toBe(true);
    }

    expect(MemoryImportStatus.safeParse({ ...base, state: 'done' }).success).toBe(false);
  });
});
