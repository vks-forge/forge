/**
 * Contract cases for the memory repository: records, moves, reads and search, access log, imports, purge.
 *
 * Why: a project memory is what the Director plans against, so both backends must give the same
 *   answers on the things that keep it trustworthy: one project search never returns another rows,
 *   ids count up per letter and are never reused, links read both ways, scope (status, kind, tags,
 *   rejected approaches) is applied inside the query and not after ranking, a record moves only along the
 *   three legal edges and keeps its words, search aids leave a version row, a failed transaction leaves
 *   no row and no index entry, and a project purge removes every memory row of that project and no other.
 *   Ranking quality (stemming, bm25 weights) is pinned separately on SQLite only. The cases live in four
 *   sibling files and are registered from here.
 *
 * Exports: describeMemoryContract().
 * Depends on: contract/memory-records.contract, contract/memory-moves.contract, contract/memory-read.contract, contract/memory-ops.contract.
 */

import type { StorageAdapter } from '@forge/core';
import { describeMemoryMovesContract } from './memory-moves.contract.js';
import { describeMemoryOpsContract } from './memory-ops.contract.js';
import { describeMemoryReadContract } from './memory-read.contract.js';
import { describeMemoryRecordsContract } from './memory-records.contract.js';

/** Registers the shared memory cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeMemoryContract(getDb: () => StorageAdapter): void {
  describeMemoryRecordsContract(getDb);
  describeMemoryMovesContract(getDb);
  describeMemoryReadContract(getDb);
  describeMemoryOpsContract(getDb);
}
