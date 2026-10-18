/**
 * Memory scopes — who may see which records, built in one place and only ever narrowed.
 *
 * Why: project memory holds records a Worker must never see (pending proposals the owner has not
 *   approved, superseded decisions, session outcomes) and a Worker's agent may be limited to certain tags
 *   and may or may not see rejected approaches (d-0078). The scope is built here from the agent
 *   definition by the server, never from anything the Worker sends, and every extra filter is intersected
 *   with it, so no tool input can widen what is visible. A record with no tags is visible only when the
 *   scope has no tags, exactly as the old whole-slice filter behaved. A rejected approach is only ever
 *   stored with status `rejected`, so the pairing is part of the rule.
 *
 * Exports: directorScope(), workerScope(), ownerScope(), narrowScope(), scopeAdmits().
 * Depends on: schemas/memory-db-tools, schemas/memory-record, types/memory-search (types only). Pure, no IO.
 */

import type { MemoryScope } from '#/schemas/memory-db-tools.js';
import type { MemoryKind, MemoryStatus } from '#/schemas/memory-record.js';
import type { ScopedRecord, ScopeRequest } from '#/types/memory-search.types.js';

const ALL_KINDS: MemoryKind[] = ['decision', 'rejected', 'proposal', 'outcome'];
const ALL_STATUSES: MemoryStatus[] = ['active', 'superseded', 'pending', 'rejected'];

/** What the Director reads: active decisions and rejected approaches of the whole project. */
export function directorScope(): MemoryScope {
  return {
    kinds: ['decision', 'rejected'],
    status: ['active', 'rejected'],
    tags: [],
    include_rejected: true,
  };
}

/** What a Worker may read for its agent's memory slice: active decisions, plus rejected approaches when asked. */
export function workerScope(agent: {
  readonly tags: readonly string[];
  readonly include_rejected: boolean;
}): MemoryScope {
  return agent.include_rejected
    ? {
        kinds: ['decision', 'rejected'],
        status: ['active', 'rejected'],
        tags: [...agent.tags],
        include_rejected: true,
      }
    : {
        kinds: ['decision'],
        status: ['active'],
        tags: [...agent.tags],
        include_rejected: false,
      };
}

/** The owner's own view (web and CLI): every kind and status, narrowed by what they filter. */
export function ownerScope(): MemoryScope {
  return {
    kinds: [...ALL_KINDS],
    status: [...ALL_STATUSES],
    tags: [],
    include_rejected: true,
  };
}

/** Whether the scope admits the record. The SQL adapter mirrors this rule in its query. */
export function scopeAdmits(scope: MemoryScope, rec: ScopedRecord): boolean {
  if (!scope.kinds.includes(rec.kind) || !scope.status.includes(rec.status)) {
    return false;
  }

  if (rec.kind === 'rejected' && (!scope.include_rejected || rec.status !== 'rejected')) {
    return false;
  }

  // A decision is never in the `rejected` state: that state belongs to rejected approaches.
  if (rec.kind === 'decision' && rec.status === 'rejected') {
    return false;
  }

  return scope.tags.length === 0 || rec.tags.some((t) => scope.tags.includes(t));
}

/**
 * The scope with the request laid over it: kinds and statuses intersect, tags intersect (or are adopted when
 * the scope has none). Nothing the request names can add to what the scope admits; an impossible tag
 * intersection admits nothing.
 */
export function narrowScope(scope: MemoryScope, req: ScopeRequest): MemoryScope {
  const kinds = req.kinds
    ? scope.kinds.filter((k) => req.kinds?.includes(k))
    : [...scope.kinds];

  const status = req.status
    ? scope.status.filter((s) => req.status?.includes(s))
    : [...scope.status];

  const wanted = req.tags ?? [];
  if (wanted.length === 0) {
    return { ...scope, kinds, status, tags: [...scope.tags] };
  }

  if (scope.tags.length === 0) {
    return { ...scope, kinds, status, tags: [...new Set(wanted)] };
  }

  const both = scope.tags.filter((t) => wanted.includes(t));

  return both.length === 0
    ? { ...scope, kinds: [], status, tags: [...scope.tags] }
    : { ...scope, kinds, status, tags: both };
}
