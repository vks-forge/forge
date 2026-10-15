/**
 * `forge stop` and the command line against a scripted machine.
 *
 * Why: a detached server has no terminal to Ctrl-C, so `forge stop` must send the install token to the recorded port only, wait for the process to actually end, never print the token, and say plainly (exit 1, no kill) when the server refuses, is unreachable or does not exit.
 *
 * Pins: not running, happy path with token, token never printed, refused token, odd status, unreachable, never exits, missing token; command-line parsing and exit codes of runCli for the three commands.
 * Depends on: src/services/{daemon/stop-server,parse-args,run-cli}, helpers/fake-daemon. No IO.
 */

import { describe, expect, it } from 'vitest';
import { stopServer } from '#/services/daemon/stop-server.js';
import { parseCommand } from '#/services/parse-args.js';
import { runCli } from '#/services/run-cli.js';
import type { CliDeps } from '#/types/cli.types.js';
import {
  FILES,
  RECORD,
  TOKEN,
  comesUp,
  createFakeWorld,
  joined,
} from '#tests/helpers/fake-daemon.js';

describe('forge stop', () => {
  function running() {
    const world = createFakeWorld();
    world.record(RECORD);
    world.alive.add(RECORD.pid);
    world.healthByPort.set(RECORD.port, 'ok');
    world.files.set(FILES.token, `${TOKEN}\n`);
    world.shutdownStatus.set(RECORD.port, 202);

    return world;
  }

  it('says so and exits 0 when nothing is running', async () => {
    const world = createFakeWorld();

    const code = await stopServer(world.ports);

    expect(code).toBe(0);
    expect(joined(world.out)).toBe('Forge is not running\n');
    expect(world.shutdownCalls).toHaveLength(0);
  });

  it('asks the recorded port to stop with the install token and waits for the exit', async () => {
    const world = running();
    world.onShutdown = (w) => w.after(3_000, () => void w.alive.delete(RECORD.pid));

    const code = await stopServer(world.ports);

    expect(code).toBe(0);
    expect(world.shutdownCalls).toEqual([{ port: RECORD.port, token: TOKEN }]);
    expect(joined(world.out)).toBe('Forge stopped\n');
  });

  it('never prints the token', async () => {
    const world = running();
    world.shutdownStatus.set(RECORD.port, 401);

    await stopServer(world.ports);

    expect(joined([...world.out, ...world.err])).not.toContain(TOKEN);
  });

  it('reports a refused token', async () => {
    const world = running();
    world.shutdownStatus.set(RECORD.port, 401);

    const code = await stopServer(world.ports);

    expect(code).toBe(1);
    expect(joined(world.err)).toContain('refused the install token');
  });

  it('reports an unexpected status', async () => {
    const world = running();
    world.shutdownStatus.set(RECORD.port, 500);

    const code = await stopServer(world.ports);

    expect(code).toBe(1);
    expect(joined(world.err)).toContain('answered 500');
  });

  it('reports a server that answered /health but then dropped the stop request', async () => {
    const world = running();
    world.shutdownStatus.delete(RECORD.port);

    const code = await stopServer(world.ports);

    expect(code).toBe(1);
    expect(joined(world.err)).toContain('answered /health but not the stop request');
  });

  it('does not send the token to a port that does not answer as Forge', async () => {
    const world = running();
    world.healthByPort.set(RECORD.port, 'not_forge');

    const code = await stopServer(world.ports);

    expect(code).toBe(1);
    expect(world.shutdownCalls).toHaveLength(0);
    expect(joined(world.err)).toContain('does not answer as a Forge server');
  });

  it('reports a server that does not exit within the timeout, without killing it', async () => {
    const world = running();

    const code = await stopServer(world.ports, 35_000);

    expect(code).toBe(1);
    expect(joined(world.err)).toContain('still running after 35 s');
    expect(world.alive.has(RECORD.pid)).toBe(true);
  });

  it('fails clearly when there is no install token to send', async () => {
    const world = running();
    world.files.delete(FILES.token);

    await expect(stopServer(world.ports)).rejects.toThrow(/no valid install token/);
  });
});

describe('command line', () => {
  it.each(['start', 'status', 'stop'])('parses %s', (word) => {
    expect(parseCommand([word])).toEqual({ kind: word });
  });

  it('refuses extra words after start', () => {
    expect(() => parseCommand(['start', 'now'])).toThrow(/usage: forge start/);
  });

  it('dispatches and maps errors to exit codes', async () => {
    const world = createFakeWorld();
    const deps = {
      daemon: world.ports,
      stdout: world.ports.stdout,
      stderr: world.ports.stderr,
    } as unknown as CliDeps;

    expect(await runCli(['status'], deps)).toBe(3);
    expect(await runCli(['stop'], deps)).toBe(0);
    comesUp(world, 0);
    expect(await runCli(['start'], deps)).toBe(0);
    expect(await runCli(['start', 'x'], deps)).toBe(2);

    world.files.delete(FILES.token);
    world.alive.add(RECORD.pid);
    world.record({ ...RECORD, pid: world.spawned[0]?.pid ?? 1 });
    expect(await runCli(['stop'], deps)).toBe(1);
    expect(joined(world.err)).toContain('no valid install token');
  });
});
