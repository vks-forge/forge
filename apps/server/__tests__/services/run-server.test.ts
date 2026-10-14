/**
 * Process start and stop: `runServer` with an injected process.
 *
 * Why: a startup failure must be a readable line and exit code 1, never an unhandled
 *   rejection, and SIGINT/SIGTERM must run the graceful shutdown exactly once and exit 0.
 *   The process is injected, so these are fast unit tests over the real assembly (real
 *   SQLite, real worktree manager) with a fake harness and model.
 *
 * Pins: bad config exits 1 with a message; a non-loopback host is refused before a port opens;
 *   a good start listens and answers /health; one signal stops the server once and exits 0;
 *   a second signal during shutdown exits 130 immediately.
 * Depends on: src/services/run-server, helpers/fixture-repo, helpers/scripted-llm. IO: fixture repo, loopback socket.
 */

import type { WorkerDriver } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runServer } from '#/services/run-server.js';
import type { ProcessIo } from '#/types/process.types.js';
import { createFixtureRepo } from '#tests/helpers/fixture-repo.js';
import type { FixtureRepo } from '#tests/helpers/fixture-repo.js';
import { createScriptedDirector } from '#tests/helpers/scripted-llm.js';
import { waitFor } from '#tests/helpers/wait-for.js';

let fixture: FixtureRepo;

// Creating the fixture runs a dozen git processes; the full suite runs on a loaded machine.
beforeEach(() => {
  fixture = createFixtureRepo();
}, 60_000);

afterEach(() => {
  fixture.dispose();
});

function io(env: Record<string, string>) {
  const stderr: string[] = [];
  const handlers = new Map<string, (signal: string) => void>();
  const exit = vi.fn();
  const process: ProcessIo = {
    env: { NODE_ENV: 'test', FORGE_ROOT: fixture.root, FORGE_PORT: '0', ...env },
    cwd: fixture.root,
    stderr: (text) => void stderr.push(text),
    exit,
    onSignal: (signal, handler) => void handlers.set(signal, handler),
  };

  return { process, stderr, handlers, exit };
}

const fakePorts = () => ({
  llm: createScriptedDirector().llm,
  // The server asks for the driver while assembling; it must never be asked to start a run.
  driver: () =>
    ({
      id: 'claude-code',
      preflight: async () => ({ ok: true, issues: [], harnessVersion: '2.1.293' }),
      start: async () => {
        throw new Error('no run should start');
      },
    }) as unknown as WorkerDriver,
});

describe('runServer', () => {
  it('exits 1 with a readable message when the config is invalid', async () => {
    const run = io({ FORGE_PORT: 'abc' });

    const server = await runServer(run.process, fakePorts);

    expect(server).toBeNull();
    expect(run.exit).toHaveBeenCalledWith(1);
    expect(run.stderr.join('')).toContain('invalid server environment: FORGE_PORT');
  });

  it('refuses a non-loopback bind before opening anything', async () => {
    const run = io({ FORGE_HOST: '0.0.0.0' });

    const server = await runServer(run.process, fakePorts);

    expect(server).toBeNull();
    expect(run.exit).toHaveBeenCalledWith(1);
    expect(run.stderr.join('')).toContain('refusing to bind "0.0.0.0"');
  });

  it('starts, serves /health, and stops once on a signal', async () => {
    const run = io({});

    const server = await runServer(run.process, fakePorts);
    const address = server?.address();
    const health = await fetch(`${address?.url}/health`);

    expect(run.exit).not.toHaveBeenCalled();
    expect(health.status).toBe(200);
    expect(run.stderr.join('')).toContain(`listening on ${address?.url}`);

    const stop = vi.spyOn(server as NonNullable<typeof server>, 'stop');
    run.handlers.get('SIGTERM')?.('SIGTERM');
    await waitFor('exit', () => run.exit.mock.calls.length > 0);

    expect(run.exit).toHaveBeenCalledOnce();
    expect(run.exit).toHaveBeenCalledWith(0);
    expect(stop).toHaveBeenCalledOnce();
    await expect(fetch(`${address?.url}/health`)).rejects.toThrow();
  });

  it('exits 130 at once on a second signal while the first shutdown is still running', async () => {
    const run = io({});
    const server = await runServer(run.process, fakePorts);
    const live = server as NonNullable<typeof server>;
    const stop = vi
      .spyOn(live, 'stop')
      .mockReturnValue(new Promise<void>(() => undefined));

    run.handlers.get('SIGINT')?.('SIGINT');
    expect(run.exit).not.toHaveBeenCalled();
    run.handlers.get('SIGINT')?.('SIGINT');

    expect(run.exit).toHaveBeenCalledExactlyOnceWith(130);
    expect(run.stderr.join('')).toContain('forcing exit');
    stop.mockRestore();
    await live.stop();
  });
});
