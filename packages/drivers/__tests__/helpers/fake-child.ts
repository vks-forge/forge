/**
 * Fake child process for driver tests.
 *
 * Why: the engines talk to a harness through a process's stdio and learn it died from its
 *   exit event. A fake with real streams lets a test play the harness (write ACP frames or
 *   stream-json lines), end it ("crashed with code 1"), and see how it was killed, with no
 *   real process and nothing billable.
 *
 * Exports: FakeChild, createFakeChild(), recordingSpawn().
 * Depends on: node:stream, src/types/claude/driver-deps. No IO.
 */

import { PassThrough } from 'node:stream';
import type {
  ChildLike,
  SpawnFn,
  SpawnOptions,
} from '#/types/claude/driver-deps.types.js';

export interface FakeChild extends ChildLike {
  /** What the driver wrote to the child's stdin. */
  readonly written: () => string;
  readonly kills: NodeJS.Signals[];
  readonly stdinPipe: PassThrough;
  readonly stdoutPipe: PassThrough;
  readonly stderrPipe: PassThrough;
  /** Ends the child as if it exited by itself. */
  exit(code: number | null, signal?: string | null): void;
  readonly hasExited: () => boolean;
}

export function createFakeChild(pid: number | undefined = 4242): FakeChild {
  const stdinPipe = new PassThrough();
  const stdoutPipe = new PassThrough();
  const stderrPipe = new PassThrough();
  const exitListeners: ((code: number | null, signal: string | null) => void)[] = [];
  const errorListeners: ((error: Error) => void)[] = [];
  const kills: NodeJS.Signals[] = [];
  let written = '';
  let exited = false;
  stdinPipe.on('data', (chunk: Buffer) => (written += chunk.toString('utf8')));
  const child: FakeChild = {
    pid,
    stdin: stdinPipe,
    stdout: stdoutPipe,
    stderr: stderrPipe,
    stdinPipe,
    stdoutPipe,
    stderrPipe,
    kills,
    written: () => written,
    hasExited: () => exited,
    kill(signal = 'SIGTERM') {
      kills.push(signal);
      child.exit(null, signal);
      return true;
    },
    on(event: 'exit' | 'error', listener: never) {
      if (event === 'exit') exitListeners.push(listener);
      else errorListeners.push(listener);
      return child;
    },
    exit(code, signal = null) {
      if (exited) return;
      exited = true;
      stdoutPipe.end();
      stderrPipe.end();
      for (const l of exitListeners) l(code, signal);
    },
  };
  return child;
}

export interface SpawnCall {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: SpawnOptions;
  readonly child: FakeChild;
}

/** A `SpawnFn` that records each call and hands out the children `make` creates. */
export function recordingSpawn(make: (call: Omit<SpawnCall, 'child'>) => FakeChild): {
  spawn: SpawnFn;
  calls: SpawnCall[];
} {
  const calls: SpawnCall[] = [];
  const spawn: SpawnFn = (command, args, options) => {
    const child = make({ command, args, options });
    calls.push({ command, args, options, child });
    return child;
  };
  return { spawn, calls };
}
