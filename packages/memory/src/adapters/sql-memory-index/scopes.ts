/**
 * Scopes for the SQL index: the caller's base scope, the defaults of a search and the wider scope used to find successors.
 *
 * Why: who may see which records is decided here and nowhere else in the index. A Worker with no scope given
 *   gets the narrowest one (active decisions, no rejected approaches), never the widest; the Director sees
 *   active decisions and rejected approaches; the owner's screen and the CLI see every kind and status.
 *   Whatever the caller asks for is laid over that scope and can only narrow it. A search for an old
 *   decision has to find it to lead to the decision that replaced it, so the lexical lists run in a scope that
 *   also holds superseded decisions, while everything returned is checked against the caller's own scope.
 *
 * Exports: baseScope(), searchScope(), widenForSuccessors(), narrowedNote(), DEFAULT_KINDS, DEFAULT_STATUS.
 * Depends on: @forge/core, types/sql-index. Pure, no IO.
 */

import { directorScope, narrowScope, ownerScope, workerScope } from '@forge/core';
import type { MemoryActor, MemoryKind, MemoryScope, MemoryStatus } from '@forge/core';
import type { SearchFilters } from '#/types/sql-index.types.js';

export const DEFAULT_KINDS: MemoryKind[] = ['decision', 'rejected'];
export const DEFAULT_STATUS: MemoryStatus[] = ['active', 'rejected'];

/** The scope an actor has when none is given: a Worker the narrowest, the Director its own, the owner all. */
export function baseScope(
  actor: MemoryActor,
  given: MemoryScope | undefined,
): MemoryScope {
  if (given !== undefined) {
    return given;
  }

  if (actor === 'worker') {
    return workerScope({ tags: [], include_rejected: false });
  }

  return actor === 'director' ? directorScope() : ownerScope();
}

/** The caller's scope with a search's filters laid over it; unset kinds and statuses mean the defaults. */
export function searchScope(base: MemoryScope, f: SearchFilters): MemoryScope {
  return narrowScope(base, {
    kinds: f.kinds ?? DEFAULT_KINDS,
    status: f.status ?? DEFAULT_STATUS,
    tags: f.tags,
  });
}

/** The scope the lexical lists run in: the same, plus superseded decisions when active ones are visible. */
export function widenForSuccessors(scope: MemoryScope): MemoryScope {
  const visible = scope.kinds.includes('decision') && scope.status.includes('active');

  return visible && !scope.status.includes('superseded')
    ? { ...scope, status: [...scope.status, 'superseded'] }
    : scope;
}

/** A sentence when the caller asked for more than its scope allows, so an empty answer is not a mystery. */
export function narrowedNote(base: MemoryScope, f: SearchFilters): string | undefined {
  const lost: string[] = [];
  if (f.kinds?.some((k) => !base.kinds.includes(k)) === true) {
    lost.push('some kinds you asked for are outside your memory slice');
  }

  if (
    base.tags.length > 0 &&
    f.tags !== undefined &&
    f.tags.some((t) => !base.tags.includes(t))
  ) {
    lost.push('tags outside your memory slice were ignored');
  }

  return lost.length === 0 ? undefined : `Narrowed: ${lost.join('; ')}.`;
}
