/**
 * Types for the Forge command-line client.
 *
 * Why: the CLI keeps its logic in services that take ports (a secret store, a file reader,
 *   output sinks), so the same code runs against the real DPAPI store in `main.ts` and
 *   against in-memory fakes in tests. Naming the command and port shapes once keeps those
 *   services short and their callers honest.
 *
 * Exports: Command, MemoryCommand, OpenedMemoryIndex, MemoryCliPorts, CliDeps, WrapSecretDeps, WrapSecretResult.
 * Depends on: @forge/core (SecretStore type), types/daemon. Types only.
 */

import type { MemoryIndex, MemoryKind, MemoryStatus, SecretStore } from '@forge/core';
import type { DaemonPorts } from '#/types/daemon.types.js';

/** A parsed command line. */
export type Command =
  | { readonly kind: 'help' }
  | { readonly kind: 'secret-wrap'; readonly name: string; readonly file: string }
  | { readonly kind: 'start'; readonly open: boolean }
  | { readonly kind: 'open'; readonly open: boolean }
  | { readonly kind: 'status' }
  | { readonly kind: 'stop' }
  | {
      readonly kind: 'memory-search';
      readonly words: readonly string[];
      readonly kinds: readonly MemoryKind[] | undefined;
      readonly status: readonly MemoryStatus[] | undefined;
      readonly tags: readonly string[];
      readonly k: number;
      readonly all: boolean;
      readonly json: boolean;
      readonly dir: string | undefined;
    }
  | {
      readonly kind: 'memory-get';
      readonly ids: readonly string[];
      readonly full: boolean;
      readonly json: boolean;
      readonly dir: string | undefined;
    }
  | {
      readonly kind: 'memory-related';
      readonly id: string;
      readonly json: boolean;
      readonly dir: string | undefined;
    };

/** The three `forge memory` commands. */
export type MemoryCommand = Extract<Command, { kind: `memory-${string}` }>;

/** A local memory index that is open: the index, whether this call had to rebuild it, and how to close it. */
export interface OpenedMemoryIndex {
  readonly index: MemoryIndex;
  readonly rebuilt: boolean;
  readonly close: () => Promise<void>;
}

/** What `forge memory` needs from the machine: where the folder is, and a way to open its local index. */
export interface MemoryCliPorts {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly isDir: (path: string) => Promise<boolean>;
  /** Opens (building or rebuilding when a record changed) the local index of the memory folder `dir`. */
  readonly openIndex: (dir: string) => Promise<OpenedMemoryIndex>;
}

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
  /** The background-server commands' view of the machine. */
  readonly daemon: DaemonPorts;
  /** The memory commands' view of the machine (the folder, the local index); loaded only when one runs. */
  readonly memory: MemoryCliPorts;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}
