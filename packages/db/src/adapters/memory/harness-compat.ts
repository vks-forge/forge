/**
 * In-memory repositories for harness build compatibility and native tool schemas.
 *
 * Why: the server and its route tests need the per-build check results and the owner's tool
 *   approvals to behave exactly as in SQLite (parse on the way in, upsert by key, rows are
 *   copies, a rolled-back transaction leaves no trace), so the contract suite can prove both
 *   backends agree.
 *
 * Exports: memoryHarnessVersions(), memoryHarnessToolSchemas().
 * Depends on: @forge/core, types/memory-state.types. No IO.
 */

import { HarnessToolSchema, HarnessVersion } from '@forge/core';
import type { HarnessToolSchemaRepository, HarnessVersionRepository } from '@forge/core';
import type { MemoryState } from '#/types/memory-state.types.js';

const versionKey = (kind: string, version: string): string => `${kind}/${version}`;

export function memoryHarnessVersions(state: MemoryState): HarnessVersionRepository {
  return {
    async get(kind, version) {
      const row = state.harnessVersions.get(versionKey(kind, version));

      return row ? structuredClone(row) : null;
    },
    async upsert(row) {
      const parsed = HarnessVersion.parse(row);
      state.harnessVersions.set(versionKey(parsed.kind, parsed.version), parsed);
    },
  };
}

export function memoryHarnessToolSchemas(
  state: MemoryState,
): HarnessToolSchemaRepository {
  const key = (kind: string, version: string, tool: string): string =>
    `${versionKey(kind, version)}/${tool}`;

  return {
    async get(kind, version, tool) {
      const row = state.harnessToolSchemas.get(key(kind, version, tool));

      return row ? structuredClone(row) : null;
    },
    async list(kind, version) {
      return [...state.harnessToolSchemas.values()]
        .filter((r) => r.harness_kind === kind && r.version === version)
        .map((r) => structuredClone(r));
    },
    async upsert(row) {
      // Map.set on an existing key keeps its position, like the SQLite upsert keeps its rowid.
      const parsed = HarnessToolSchema.parse(row);
      state.harnessToolSchemas.set(
        key(parsed.harness_kind, parsed.version, parsed.tool),
        parsed,
      );
    },
  };
}
