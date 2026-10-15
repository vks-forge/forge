/**
 * Harness registry ports — installed harnesses, parked harnesses, build checks and tool approvals.
 *
 * Why: which harnesses are installed, which are parked until a quota resets, whether an
 *   installed build passed the compatibility check and which of its native tools the owner
 *   approved decide whether a Worker may start at all (d-0087, d-0088, d-0097). They share
 *   the storage transaction so a check result and the pause it causes commit together; the
 *   interfaces live apart from the ticket and run repositories so each file stays one concept.
 *
 * Exports: HarnessRepository, HarnessStateRepository, HarnessVersionRepository,
 *   HarnessToolSchemaRepository.
 * Depends on: schemas/harness, schemas/harness-state, schemas/harness-compat. Types only.
 */

import type { Harness } from '#/schemas/harness.js';
import type { HarnessState } from '#/schemas/harness-state.js';
import type {
  CompatStatus,
  HarnessToolSchema,
  HarnessVersion,
  ToolSchemaStatus,
} from '#/schemas/harness-compat.js';

/** The `harnesses` registry: installed harnesses and how each authenticates (d-0087). */
export interface HarnessRepository {
  get(id: string): Promise<Harness | null>;
  // Insert or replace by id; the row keeps its place in `list`.
  upsert(harness: Harness): Promise<void>;
  // Every harness, in first-insert order.
  list(): Promise<Harness[]>;
}

/** Which harnesses are parked until their quota resets (d-0097). */
export interface HarnessStateRepository {
  get(harnessId: string): Promise<HarnessState | null>;
  // Insert or replace by harness id.
  upsert(state: HarnessState): Promise<void>;
  // Removes the row; false when the harness was not paused.
  clear(harnessId: string): Promise<boolean>;
  // Every row, ordered by harness id (expired rows included: the caller compares to `now`).
  list(): Promise<HarnessState[]>;
}

/** Per-build compatibility results of an installed harness (d-0088). */
export interface HarnessVersionRepository {
  get(kind: string, version: string): Promise<HarnessVersion | null>;
  // Every build whose check has the given result, in first-insert order.
  listByCompat(compat: CompatStatus): Promise<HarnessVersion[]>;
  // Insert or replace by (kind, version).
  upsert(row: HarnessVersion): Promise<void>;
}

/** Per-build native tool schemas and the owner's decision on each (d-0088). */
export interface HarnessToolSchemaRepository {
  get(kind: string, version: string, tool: string): Promise<HarnessToolSchema | null>;
  // Every tool row of one build, in first-insert order.
  list(kind: string, version: string): Promise<HarnessToolSchema[]>;
  // Every tool row of every build with the given decision, in first-insert order.
  listByStatus(status: ToolSchemaStatus): Promise<HarnessToolSchema[]>;
  // Insert or replace by (kind, version, tool).
  upsert(row: HarnessToolSchema): Promise<void>;
}
