/**
 * Real clock and process spawner for composing the Claude driver in an app.
 *
 * Why: the driver takes its clock and `spawn` as ports so tests control time and
 *   processes. The app needs the real ones, and they carry two decisions that are easy to
 *   get wrong: processes are started with piped stdio, hidden windows and never through a
 *   shell (so a prompt or path cannot be re-parsed as a command), and timers keep the
 *   process alive until they fire or are cancelled, so a stall timer is not silently
 *   dropped when nothing else is pending.
 *
 * Exports: systemClock, nodeSpawn.
 * Depends on: node:child_process, types/claude/driver-deps. IO: timers, spawns processes.
 */

import { spawn } from 'node:child_process';
import type { Clock, SpawnFn } from '#/types/claude/driver-deps.types.js';

export const systemClock: Clock = {
  now: () => Date.now(),
  after(ms, fn) {
    const timer = setTimeout(fn, ms);

    return () => clearTimeout(timer);
  },
};

export const nodeSpawn: SpawnFn = (command, args, options) =>
  spawn(command, [...args], {
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(options.env ? { env: { ...options.env } } : {}),
    ...(options.detached ? { detached: true } : {}),
    stdio: 'pipe',
    windowsHide: true,
    shell: false,
  });
