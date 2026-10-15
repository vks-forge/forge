/**
 * Finding the background server: `server.json`, the process table and `/health`.
 *
 * Why: three commands need the same answer to "is Forge running, and where". A record file
 *   alone lies after a crash (stale pid), and a pid alone lies after the OS reuses it for an
 *   unrelated program, so the server counts as running only when the recorded process exists
 *   and the recorded port answers `/health` as a Forge server. The other outcomes are kept
 *   apart because the commands treat them differently: a dead pid is just stale files, a live
 *   pid that does not answer is a server that is starting, hung or being shut down.
 *
 * Exports: serverUrl(), readServerRecord(), findServer().
 * Depends on: @forge/core (ServerRecord), types/daemon. IO: through the ports.
 */

import { ServerRecord } from '@forge/core';
import type { DaemonPorts, ServerState } from '#/types/daemon.types.js';

/** The base URL of a server on `port` (loopback only, d-0093). */
export function serverUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

/** The parsed `server.json`, or `undefined` when it is missing or not a valid record. */
export async function readServerRecord(
  ports: Pick<DaemonPorts, 'layout' | 'readText'>,
): Promise<ServerRecord | undefined> {
  const text = await ports.readText((await ports.layout()).serverJsonPath);
  if (text === undefined) {
    return undefined;
  }

  try {
    const parsed = ServerRecord.safeParse(JSON.parse(text));

    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** Looks the server up and says what state it is in. */
export async function findServer(
  ports: Pick<DaemonPorts, 'layout' | 'readText' | 'health' | 'isAlive'>,
): Promise<ServerState> {
  const record = await readServerRecord(ports);
  if (!record) {
    return { kind: 'absent' };
  }

  if (!ports.isAlive(record.pid)) {
    return { kind: 'stale', record };
  }

  const health = await ports.health(record.port);

  return health === 'ok' || health === 'degraded'
    ? { kind: 'running', record, health }
    : { kind: 'unresponsive', record };
}
