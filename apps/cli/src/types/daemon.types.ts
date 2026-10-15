/**
 * Types for the background-server commands of the `forge` CLI.
 *
 * Why: `forge start`, `status` and `stop` act on another process, so everything they touch
 *   (the data-home files, the HTTP API, the process table, the clock, spawning) comes in as
 *   one port bag. The same logic then runs against the real machine in `main.ts` and against
 *   a scripted fake in tests, where "the server does not answer for 25 s" takes no time.
 *
 * Exports: HealthState, ServerState, DaemonPorts, SpawnedServer, Output.
 * Depends on: @forge/core (DataHomeLayout, ServerRecord types). Types only.
 */

import type { DataHomeLayout, ServerRecord } from '@forge/core';

/** What `GET /health` on a port said: a Forge server's verdict, silence, or someone else. */
export type HealthState = 'ok' | 'degraded' | 'unreachable' | 'not_forge';

/**
 * What the data home says about the server: `running` (recorded process alive and
 * answering), `unresponsive` (process alive, no answer: starting, hung or shutting down),
 * `stale` (record names a dead process), `absent` (no usable record).
 */
export type ServerState =
  | {
      readonly kind: 'running';
      readonly record: ServerRecord;
      readonly health: 'ok' | 'degraded';
    }
  | { readonly kind: 'unresponsive'; readonly record: ServerRecord }
  | { readonly kind: 'stale'; readonly record: ServerRecord }
  | { readonly kind: 'absent' };

export interface SpawnedServer {
  readonly pid: number;
  /** The file the server's output goes to. */
  readonly logPath: string;
  /** Size of the server log before this start, so a failure shows only its own lines. */
  readonly logStart: number;
}

/** Where the commands print. */
export interface Output {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

/** Everything the daemon commands need from the machine. */
export interface DaemonPorts extends Output {
  /** The data-home paths (resolved on first use). */
  readonly layout: () => Promise<DataHomeLayout>;
  /** Text of a file, `undefined` when it does not exist. */
  readonly readText: (path: string) => Promise<string | undefined>;
  /** `GET http://127.0.0.1:<port>/health`, no token. */
  readonly health: (port: number) => Promise<HealthState>;
  /** `POST /admin/shutdown` with the token; resolves with the HTTP status, rejects when unreachable. */
  readonly shutdown: (port: number, token: string) => Promise<number>;
  /** Starts the built server detached, its output going to `<dataHome>/logs/server.log`. */
  readonly spawnServer: () => Promise<SpawnedServer>;
  /** The server log from `offset` on. */
  readonly readLog: (offset: number) => Promise<string>;
  readonly isAlive: (pid: number) => boolean;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
}
