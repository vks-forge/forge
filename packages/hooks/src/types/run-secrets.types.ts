/**
 * Type of the in-memory registry of per-run credentials.
 *
 * Why: the hook handler reads a run's bearer token and HMAC secret through
 *   `credentials()`, and gate G1 reads the secret to verify the receipt chain. Both must
 *   see the same, memory-only source (d-0054), so the shape lives beside the handler's
 *   other dependency types and each consumer takes only the part it needs.
 *
 * Exports: RunSecretRegistry.
 * Depends on: @forge/tools (HmacKey), types/hook-handler. Types only.
 */

import type { HmacKey } from '@forge/tools';
import type { RunCredentials } from '#/types/hook-handler.types.js';

/**
 * The per-run bearer token and HMAC secret, in server memory only (d-0054). A restart
 * kills every in-flight run, so nothing here is ever written to disk.
 */
export interface RunSecretRegistry {
  /**
   * Registers `token` for a run and creates its HMAC secret. A run id is prepared once
   * (a resume is a new run, d-0055); registering it again throws, because silently issuing
   * a second secret would break the receipt chain already signed with the first.
   */
  register(runId: string, token: string): RunCredentials;
  credentials(runId: string): Promise<RunCredentials | null>;
  /** The run's receipt secret, or null when this process never held it. */
  secret(runId: string): HmacKey | null;
  size(): number;
}
