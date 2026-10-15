/**
 * A scripted machine for the daemon commands: files, processes, a clock and a fake server.
 *
 * Why: `forge start` waits up to 60 s and `forge stop` up to 35 s, and their interesting
 *   cases (the server never answers, dies while starting, ignores the stop request) are
 *   exactly the ones a real process makes slow and flaky. In this world time only moves when
 *   the command sleeps, so each of those cases runs in microseconds and deterministically.
 *
 * Exports: FakeWorld, createFakeWorld(), comesUp(), joined(), TOKEN, CODE, RECORD, FILES.
 * Depends on: @forge/core (layout, ServerRecord types), types/daemon. No IO.
 */

import type { ServerRecord } from '@forge/core';
import type { DaemonPorts, HealthState, SpawnedServer } from '#/types/daemon.types.js';

export const TOKEN = 'A'.repeat(43);

/** The one-time code the fake server hands out. */
export const CODE = 'one-time-code_123';

const HOME = 'C:\\Forge';

export const FILES = {
  record: `${HOME}\\server.json`,
  token: `${HOME}\\install-token`,
};

export interface FakeWorld {
  readonly ports: DaemonPorts;
  readonly out: string[];
  readonly err: string[];
  readonly files: Map<string, string>;
  /** Pids that exist. */
  readonly alive: Set<number>;
  /** What `/health` says per port (absent: unreachable). */
  readonly healthByPort: Map<number, HealthState>;
  /** The HTTP status each port answers to a shutdown request (absent: unreachable). */
  readonly shutdownStatus: Map<number, number>;
  readonly shutdownCalls: { port: number; token: string }[];
  /** What `POST /auth/open-code` answers per port (absent: 200 with `CODE`). */
  readonly openCodeStatus: Map<number, number>;
  readonly openCodeCalls: { port: number; token: string }[];
  /** URLs handed to the browser opener. */
  readonly opened: string[];
  /** When set, the browser opener rejects. */
  failBrowser: boolean;
  readonly spawned: SpawnedServer[];
  /** What the next spawned server does; receives the world and the new pid. */
  onSpawn: (world: FakeWorld, pid: number) => void;
  /** What a stop request does besides answering; receives the world. */
  onShutdown: (world: FakeWorld, port: number) => void;
  log: string;
  clock: number;
  record: (record: ServerRecord) => void;
  /** Runs `fn` once the command has slept `ms` of fake time from now. */
  after: (ms: number, fn: () => void) => void;
}

export const RECORD: ServerRecord = {
  pid: 4242,
  port: 4310,
  startedAt: '2026-10-15T10:00:00.000Z',
  version: '0.0.0',
};

export function createFakeWorld(
  startAt = Date.parse('2026-10-15T12:03:00.000Z'),
): FakeWorld {
  let nextPid = 9000;
  const timers: { at: number; fn: () => void }[] = [];
  const world: FakeWorld = {
    out: [],
    err: [],
    files: new Map(),
    alive: new Set(),
    healthByPort: new Map(),
    shutdownStatus: new Map(),
    shutdownCalls: [],
    openCodeStatus: new Map(),
    openCodeCalls: [],
    opened: [],
    failBrowser: false,
    spawned: [],
    log: '',
    clock: startAt,
    onSpawn: () => undefined,
    onShutdown: () => undefined,
    after: (ms, fn) => void timers.push({ at: world.clock + ms, fn }),
    record: (record) => {
      world.files.set(FILES.record, JSON.stringify(record));
    },
    ports: {
      stdout: (text) => void world.out.push(text),
      stderr: (text) => void world.err.push(text),
      layout: async () => ({
        home: HOME,
        dbPath: `${HOME}\\forge.db`,
        secretsDir: `${HOME}\\secrets`,
        memoryDir: `${HOME}\\memory`,
        worktreesDir: `${HOME}\\worktrees`,
        runsDir: `${HOME}\\runs`,
        backupsDir: `${HOME}\\backups`,
        logsDir: `${HOME}\\logs`,
        serverJsonPath: FILES.record,
        installTokenPath: FILES.token,
        serverLockPath: `${HOME}\\server.lock`,
      }),
      readText: async (path) => world.files.get(path),
      health: async (port) => world.healthByPort.get(port) ?? 'unreachable',
      shutdown: async (port, token) => {
        world.shutdownCalls.push({ port, token });
        const status = world.shutdownStatus.get(port);
        if (status === undefined) {
          throw new Error('connect ECONNREFUSED');
        }

        world.onShutdown(world, port);

        return status;
      },
      requestOpenCode: async (port, token) => {
        world.openCodeCalls.push({ port, token });
        const status = world.openCodeStatus.get(port) ?? 200;

        return status === 200 ? { status, code: CODE } : { status };
      },
      openBrowser: async (url) => {
        if (world.failBrowser) {
          throw new Error('no browser');
        }

        world.opened.push(url);
      },
      spawnServer: async () => {
        nextPid += 1;
        const child = {
          pid: nextPid,
          logPath: `${HOME}\\logs\\server.log`,
          logStart: world.log.length,
        };

        world.spawned.push(child);
        world.alive.add(child.pid);
        world.onSpawn(world, child.pid);

        return child;
      },
      readLog: async (offset) => world.log.slice(offset),
      isAlive: (pid) => world.alive.has(pid),
      sleep: async (ms) => {
        world.clock += ms;
        for (const timer of timers.filter((t) => t.at <= world.clock)) {
          timers.splice(timers.indexOf(timer), 1);
          timer.fn();
        }
      },
      now: () => world.clock,
    },
  };

  return world;
}

/** The lines a command printed, as one string. */
export const joined = (lines: string[]): string => lines.join('');

/** A server that comes up `afterMs` after it was spawned. */
export function comesUp(world: FakeWorld, afterMs: number, port = 4310): void {
  world.onSpawn = (w, pid) =>
    w.after(afterMs, () => {
      w.record({ ...RECORD, pid, port });
      w.healthByPort.set(port, 'ok');
    });
}
