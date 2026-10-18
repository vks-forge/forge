/**
 * SQLite MemoryRepository: the five memory repositories assembled behind the one port.
 *
 * Why: the engine and the memory package see `tx.memory` as one contract, while the SQL lives in five small
 *   files (records, reads, search, links, log) so each stays readable and the single writer of
 *   `memory_records` is easy to point at. This file only assembles them.
 *
 * Exports: createMemoryRepository().
 * Depends on: adapters/sqlite/memory-*-repository, @forge/core (types).
 */

import type { MemoryRepository } from '@forge/core';
import { createMemoryLinksRepository } from '#/adapters/sqlite/memory-links-repository.js';
import { createMemoryLogRepository } from '#/adapters/sqlite/memory-log-repository.js';
import { createMemoryReadRepository } from '#/adapters/sqlite/memory-read-repository.js';
import { createMemoryRecordsRepository } from '#/adapters/sqlite/memory-records-repository.js';
import { createMemorySearchRepository } from '#/adapters/sqlite/memory-search-repository.js';
import type { SqlDriver } from '#/types/storage-driver.types.js';

export function createMemoryRepository(driver: SqlDriver): MemoryRepository {
  return {
    ...createMemoryRecordsRepository(driver),
    ...createMemoryReadRepository(driver),
    ...createMemorySearchRepository(driver),
    ...createMemoryLinksRepository(driver),
    ...createMemoryLogRepository(driver),
  };
}
