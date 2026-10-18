/**
 * Pins that a Worker's memory scope can only ever be narrower than what its agent allows.
 *
 * Why: Workers read project memory through tools, and project memory holds things a Worker must never
 *   see: pending proposals the owner has not approved, superseded decisions, outcomes and other agents'
 *   slices. The scope is built from the agent definition by the server (d-0078) and every filter a caller
 *   adds is intersected with it, so no tool input can widen what is visible. A record with no tags is
 *   visible only when the agent's tag list is empty, as it was before search existed.
 *
 * Pins: the Director, Worker and owner scopes, never a pending, superseded or proposal / outcome record
 *   for a Worker, `include_rejected: false` hides rejected approaches, any narrowing stays a subset
 *   (property), tag intersection that is empty shows nothing, and the tag rule of `scopeAdmits`.
 * Depends on: src/domain/memory-search/worker-scope, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  directorScope,
  narrowScope,
  ownerScope,
  scopeAdmits,
  workerScope,
} from '#/domain/memory-search/worker-scope.js';
import type { MemoryScope } from '#/schemas/memory-db-tools.js';
import type { MemoryKind, MemoryStatus } from '#/schemas/memory-record.js';

const KINDS: MemoryKind[] = ['decision', 'rejected', 'proposal', 'outcome'];
const STATUSES: MemoryStatus[] = ['active', 'superseded', 'pending', 'rejected'];

const everything = KINDS.flatMap((kind) => STATUSES.map((status) => ({ kind, status })));

/** A rejected approach is only stored as `rejected`, and a decision is never `rejected`. */
const possible = everything.filter(
  (r) =>
    (r.kind === 'rejected') === (r.status === 'rejected') ||
    r.kind === 'proposal' ||
    r.kind === 'outcome',
);

describe('scopes', () => {
  it('gives the Director active decisions and rejected approaches', () => {
    const s = directorScope();

    expect(s.kinds).toEqual(['decision', 'rejected']);
    expect(s.include_rejected).toBe(true);
    expect(s.tags).toEqual([]);
  });

  it('gives a Worker only active decisions, and rejected approaches when its agent asks', () => {
    expect(workerScope({ tags: [], include_rejected: false })).toEqual({
      kinds: ['decision'],
      status: ['active'],
      tags: [],
      include_rejected: false,
    });

    const withRejected = workerScope({ tags: ['db'], include_rejected: true });
    expect(withRejected.kinds).toEqual(['decision', 'rejected']);
    expect(withRejected.tags).toEqual(['db']);
  });

  it('gives the owner every kind and status that can exist', () => {
    const s = ownerScope();

    for (const r of possible) {
      expect(scopeAdmits(s, { ...r, tags: [] })).toBe(true);
    }
  });

  it('never admits pending, superseded, proposals or outcomes to a Worker (property)', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.array(fc.stringMatching(/^[a-z]{1,5}$/), { maxLength: 4 }),
        fc.array(fc.stringMatching(/^[a-z]{1,5}$/), { maxLength: 4 }),
        (include_rejected, scopeTags, recordTags) => {
          const s = workerScope({ tags: scopeTags, include_rejected });

          return everything.every((r) => {
            if (!scopeAdmits(s, { ...r, tags: recordTags })) {
              return true;
            }

            const rejectedOk =
              r.kind === 'rejected' && r.status === 'rejected' && include_rejected;

            const decisionOk = r.kind === 'decision' && r.status === 'active';

            return rejectedOk || decisionOk;
          });
        },
      ),
    );
  });
});

describe('scopeAdmits tags', () => {
  const s: MemoryScope = {
    ...workerScope({ tags: ['db', 'api'], include_rejected: true }),
  };

  it('admits a record holding any scope tag and refuses one with none or with no tags', () => {
    expect(
      scopeAdmits(s, { kind: 'decision', status: 'active', tags: ['x', 'api'] }),
    ).toBe(true);

    expect(scopeAdmits(s, { kind: 'decision', status: 'active', tags: ['x'] })).toBe(
      false,
    );

    expect(scopeAdmits(s, { kind: 'decision', status: 'active', tags: [] })).toBe(false);
  });

  it('admits a record with no tags when the scope has no tags', () => {
    const open = workerScope({ tags: [], include_rejected: false });

    expect(scopeAdmits(open, { kind: 'decision', status: 'active', tags: [] })).toBe(
      true,
    );
  });
});

describe('narrowScope', () => {
  it('only ever shrinks what the scope admits (property)', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.array(fc.constantFrom(...KINDS)),
        fc.array(fc.constantFrom(...STATUSES)),
        fc.array(fc.stringMatching(/^[a-z]{1,3}$/), { maxLength: 4 }),
        fc.array(fc.stringMatching(/^[a-z]{1,3}$/), { maxLength: 4 }),
        fc.array(fc.stringMatching(/^[a-z]{1,3}$/), { maxLength: 3 }),
        (include_rejected, kinds, status, tags, scopeTags, recordTags) => {
          const base = workerScope({ tags: scopeTags, include_rejected });
          const narrowed = narrowScope(base, { kinds, status, tags });

          return everything.every(
            (r) =>
              !scopeAdmits(narrowed, { ...r, tags: recordTags }) ||
              scopeAdmits(base, { ...r, tags: recordTags }),
          );
        },
      ),
    );
  });

  it('shows nothing when the requested tags and the scope tags share none', () => {
    const base = workerScope({ tags: ['db'], include_rejected: false });
    const narrowed = narrowScope(base, { tags: ['api'] });

    expect(
      scopeAdmits(narrowed, { kind: 'decision', status: 'active', tags: ['db'] }),
    ).toBe(false);

    expect(
      scopeAdmits(narrowed, { kind: 'decision', status: 'active', tags: ['api'] }),
    ).toBe(false);
  });

  it('keeps the scope tags when the request names a subset and adopts the request when the scope has none', () => {
    const base = workerScope({ tags: ['db', 'api'], include_rejected: false });

    expect(narrowScope(base, { tags: ['api', 'zzz'] }).tags).toEqual(['api']);
    expect(
      narrowScope(workerScope({ tags: [], include_rejected: false }), { tags: ['x'] })
        .tags,
    ).toEqual(['x']);
  });

  it('cannot bring back a kind the scope does not have', () => {
    const base = workerScope({ tags: [], include_rejected: false });

    expect(narrowScope(base, { kinds: ['rejected', 'proposal'] }).kinds).toEqual([]);
  });
});
