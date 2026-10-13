/**
 * Types for the Forge command-line client.
 *
 * Why: the CLI keeps its logic in services that take ports (a secret store, a file reader,
 *   output sinks), so the same code runs against the real DPAPI store in `main.ts` and
 *   against in-memory fakes in tests. Naming the command and port shapes once keeps those
 *   services short and their callers honest.
 *
 * Exports: Command, CliDeps, WrapSecretDeps, WrapSecretResult.
 * Depends on: @forge/core (SecretStore type). Types only.
 */

import type { SecretStore } from '@forge/core';

/** A parsed command line. */
export type Command =
  | { readonly kind: 'help' }
  | { readonly kind: 'secret-wrap'; readonly name: string; readonly file: string };

/** Ports `forge secret wrap` needs. */
export interface WrapSecretDeps {
  readonly store: SecretStore;
  readonly readFile: (path: string) => Promise<Uint8Array>;
  /** Absolute form of a path, for messages. */
  readonly resolvePath: (path: string) => string;
}

export interface WrapSecretResult {
  readonly name: string;
  readonly bytes: number;
  /** Absolute path of the plaintext file, which was left untouched. */
  readonly sourcePath: string;
  /** A PowerShell command the user can run to delete the plaintext. */
  readonly deleteCommand: string;
}

/** Everything `runCli` needs from its environment; `main.ts` supplies the real ones. */
export interface CliDeps extends Omit<WrapSecretDeps, 'store'> {
  /** Opens the secret store; called only by commands that need it. */
  readonly openStore: () => Promise<SecretStore>;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}
