/**
 * `forge start` against a scripted machine.
 *
 * Why: `forge start` must be safe to run twice and must never leave the user guessing: a second start must not spawn a second server, a server that dies while starting must show why (its own log lines, not an old start's), and one that never answers must time out with the log path instead of hanging.
 *
 * Pins: already running, fresh start, stale record, record from another process, died with its log, died silently, lost the lock race, timeout, silent recorded server, malformed record, a port held by another program.
 * Depends on: src/services/daemon/{start-server,find-server}, helpers/fake-daemon. No IO.
 */

import { describe, expect, it } from 'vitest';
import { findServer } from '#/services/daemon/find-server.js';
import { startServer } from '#/services/daemon/start-server.js';
import {
  FILES,
  RECORD,
  comesUp,
  createFakeWorld,
  joined,
} from '#tests/helpers/fake-daemon.js';

describe('forge start', () => {
  it('only prints the URL when a live server is already recorded', async () => {
    const world = createFakeWorld();
    world.record(RECORD);
    world.alive.add(RECORD.pid);
    world.healthByPort.set(RECORD.port, 'ok');

    const code = await startServer(world.ports);

    expect(code).toBe(0);
    expect(world.spawned).toHaveLength(0);
    expect(joined(world.out)).toBe(
      'Forge is already running at http://127.0.0.1:4310 (pid 4242)\n',
    );
  });

  it('spawns a server, waits for it to answer and prints its URL and log', async () => {
    const world = createFakeWorld();
    comesUp(world, 1_000);

    const code = await startServer(world.ports);

    expect(code).toBe(0);
    expect(world.spawned).toHaveLength(1);
    expect(joined(world.out)).toContain(
      `Forge is running at http://127.0.0.1:4310 (pid ${world.spawned[0]?.pid})`,
    );

    expect(joined(world.out)).toContain('Logs: C:\\Forge\\logs\\server.log');
  });

  it('replaces a stale record from a crashed server', async () => {
    const world = createFakeWorld();
    world.record({ ...RECORD, pid: 1 });
    comesUp(world, 0, 4399);

    const code = await startServer(world.ports);

    expect(code).toBe(0);
    expect(world.spawned).toHaveLength(1);
    expect(joined(world.out)).toContain('http://127.0.0.1:4399');
  });

  it('does not accept a record written by another process as the new server', async () => {
    const world = createFakeWorld();
    world.record({ ...RECORD, pid: 1 });
    world.healthByPort.set(RECORD.port, 'ok');

    const code = await startServer(world.ports, { timeoutMs: 2_000 });

    expect(code).toBe(1);
    expect(joined(world.err)).toContain('did not answer on /health within 2 s');
  });

  it('shows the last lines of the log when the server dies while starting', async () => {
    const world = createFakeWorld();
    world.log = 'old line from an earlier start\n';
    world.onSpawn = (w, pid) => {
      w.log +=
        'forge-server: port 4310 on 127.0.0.1 is already in use by another program; stop it or set FORGE_PORT to a free port\n';

      w.alive.delete(pid);
    };

    const code = await startServer(world.ports);

    expect(code).toBe(1);
    expect(joined(world.err)).toContain('the server stopped while starting:');
    expect(joined(world.err)).toContain('already in use by another program');
    expect(joined(world.err)).not.toContain('old line');
  });

  it('says only that it stopped when the log is empty', async () => {
    const world = createFakeWorld();
    world.onSpawn = (w, pid) => void w.alive.delete(pid);

    const code = await startServer(world.ports);

    expect(code).toBe(1);
    expect(joined(world.err)).toBe('forge: the server stopped while starting\n');
  });

  it('reports a running server when the new one lost the lock to a concurrent start', async () => {
    const world = createFakeWorld();
    world.onSpawn = (w, pid) => {
      w.record(RECORD);
      w.alive.add(RECORD.pid);
      w.healthByPort.set(RECORD.port, 'ok');
      w.alive.delete(pid);
    };

    const code = await startServer(world.ports);

    expect(code).toBe(0);
    expect(joined(world.out)).toContain(
      'Forge is already running at http://127.0.0.1:4310',
    );
  });

  it('times out when the server never answers and leaves it running', async () => {
    const world = createFakeWorld();

    const code = await startServer(world.ports, { timeoutMs: 20_000 });

    expect(code).toBe(1);
    expect(joined(world.err)).toContain('did not answer on /health within 20 s');
    expect(world.alive.has(world.spawned[0]?.pid ?? 0)).toBe(true);
  });

  it('refuses to start over a recorded server that is alive but silent', async () => {
    const world = createFakeWorld();
    world.record(RECORD);
    world.alive.add(RECORD.pid);

    const code = await startServer(world.ports);

    expect(code).toBe(1);
    expect(world.spawned).toHaveLength(0);
    expect(joined(world.err)).toContain('does not answer on port 4310');
  });

  it('treats a record that is not valid JSON, or has other fields, as absent', async () => {
    const world = createFakeWorld();
    world.files.set(FILES.record, '{not json');
    expect((await findServer(world.ports)).kind).toBe('absent');

    world.files.set(FILES.record, JSON.stringify({ ...RECORD, extra: 1 }));
    expect((await findServer(world.ports)).kind).toBe('absent');
  });

  it('treats a port held by something that is not Forge as not running', async () => {
    const world = createFakeWorld();
    world.record(RECORD);
    world.alive.add(RECORD.pid);
    world.healthByPort.set(RECORD.port, 'not_forge');

    expect((await findServer(world.ports)).kind).toBe('unresponsive');
  });
});
