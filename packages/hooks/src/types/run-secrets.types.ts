/**
 * Types of the registry of per-run credentials.
 *
 * Why: the hook handler reads a run's bearer token, secret and generation through
 *   `credentials()`, and gate G1 reads each generation's secret to verify the receipt chain
 *   segment by segment. Both must see the same source, which keeps the token in memory and
 *   the secrets in the SecretStore (d-0100), so the shape lives beside the handler's other
 *   dependency types and each consumer takes only the part it needs.
 *
 * Exports: RunSecretRegistry, RunSecretRegistryOptions.
 * Depends on: @forge/core (SecretStore), @forge/tools (HmacKey), types/hook-handler. Types only.
 */

import type { SecretStore } from '@forge/core';
import type { HmacKey } from '@forge/tools';
import type { RunCredentials } from '#/types/hook-handler.types.js';

/** What the registry is built from; every field is optional. */
export interface RunSecretRegistryOptions {
  /**
   * Where secrets live for the life of the run, as `run/<runId>/secret-g<generation>`. Without
   * a store secrets live in memory only and a restart loses them (tests, tools).
   */
  readonly store?: SecretStore;
  /** Secret source; injectable for tests. Defaults to 32 random bytes as hex. */
  readonly newSecret?: () => string;
  /** Most runs whose token is kept in memory; the oldest fall out first. */
  readonly max?: number;
}

/**
 * Per-run bearer token and HMAC secrets. The secret of every generation is kept in the
 * SecretStore until the run is retired (d-0100); the token is only ever in memory, so after a
 * restart an old Worker's token is unknown and its hook calls are refused.
 */
export interface RunSecretRegistry {
  /**
   * Registers `token` and a new HMAC secret for `generation` of a run (1 for a first start,
   * the run's new generation on a resume) and returns them. A generation is registered once:
   * a second registration would replace the secret its receipts were signed with, so it
   * throws.
   */
  register(runId: string, token: string, generation?: number): Promise<RunCredentials>;
  /** The run's current token, secret and generation; null when this process never registered it. */
  credentials(runId: string): Promise<RunCredentials | null>;
  /** The secret of one generation, read through to the store; null when it is gone. */
  secret(runId: string, generation: number): Promise<HmacKey | null>;
  /** Deletes every generation's secret of a run from memory and the store. Idempotent. */
  retire(runId: string): Promise<void>;
  /**
   * Retires every run in the store for which `isOver` says so, and returns their ids. A
   * crash can leave secrets of settled runs behind; this is the startup sweep.
   */
  sweep(isOver: (runId: string) => Promise<boolean>): Promise<string[]>;
  /** Runs whose credentials are held in memory. */
  size(): number;
}
