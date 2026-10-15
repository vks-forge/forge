/**
 * `forge open` and the browser hand-off of `forge start`, against a scripted machine.
 *
 * Why: the control room is signed in by a one-time link, so the CLI is the only holder of the
 *   install token that ever talks to the browser. It must ask for the code with the token,
 *   build the link on the server's own port, never print the token, open the browser through
 *   the injected opener (no real browser here), survive a browser that will not launch, and
 *   say plainly when Forge is not running or refuses the token. `forge start` must wait long
 *   enough for a slow cold start (about 22 s on a loaded machine) and check once more before
 *   it reports failure.
 *
 * Pins: link shape and token use; `--no-open` prints only; opener failure keeps exit 0 and
 *   the link; not running, refused token and bad status; start opens after health, also when
 *   already running, never before; the 60 s default wait with progress lines; the last look.
 * Depends on: src/services/daemon/{open-ui,start-server}, helpers/fake-daemon. No IO.
 */

import { describe, expect, it } from 'vitest';
import { openUi } from '#/services/daemon/open-ui.js';
import { START_TIMEOUT_MS, startServer } from '#/services/daemon/start-server.js';
import {
  CODE,
  FILES,
  RECORD,
  TOKEN,
  comesUp,
  createFakeWorld,
  joined,
} from '#tests/helpers/fake-daemon.js';
import type { FakeWorld } from '#tests/helpers/fake-daemon.js';

const LINK = `http://127.0.0.1:4310/auth/open?code=${CODE}`;

function running(): FakeWorld {
  const world = createFakeWorld();
  world.record(RECORD);
  world.alive.add(RECORD.pid);
  world.healthByPort.set(RECORD.port, 'ok');
  world.files.set(FILES.token, TOKEN);

  return world;
}

describe('forge open', () => {
  it('asks for a code with the token, prints the link and opens it', async () => {
    const world = running();

    const code = await openUi(world.ports, true);

    expect(code).toBe(0);
    expect(world.openCodeCalls).toEqual([{ port: 4310, token: TOKEN }]);
    expect(world.opened).toEqual([LINK]);
    expect(joined(world.out)).toContain(LINK);
    expect(joined(world.out) + joined(world.err)).not.toContain(TOKEN);
  });

  it('only prints the link with --no-open', async () => {
    const world = running();

    const code = await openUi(world.ports, false);

    expect(code).toBe(0);
    expect(world.opened).toEqual([]);
    expect(joined(world.out)).toContain(LINK);
  });

  it('keeps the link and exits 0 when the browser cannot start', async () => {
    const world = running();
    world.failBrowser = true;

    const code = await openUi(world.ports, true);

    expect(code).toBe(0);
    expect(joined(world.out)).toContain(LINK);
    expect(joined(world.err)).toContain('could not start a browser');
  });

  it('says so when Forge is not running and asks for no code', async () => {
    const world = createFakeWorld();

    const code = await openUi(world.ports, true);

    expect(code).toBe(1);
    expect(joined(world.err)).toContain('forge start');
    expect(world.openCodeCalls).toHaveLength(0);
  });

  it('refuses to send the token to a port that cannot prove it holds it', async () => {
    const world = running();
    world.impostors.add(4310);

    await expect(openUi(world.ports, true)).rejects.toThrow(
      'something else is answering on port 4310; Forge is not running there',
    );

    expect(world.openCodeCalls).toHaveLength(0);
    expect(world.opened).toEqual([]);
  });

  it('rejects when the server refuses the token or answers an error', async () => {
    const refused = running();
    refused.openCodeStatus.set(4310, 401);
    const broken = running();
    broken.openCodeStatus.set(4310, 500);

    await expect(openUi(refused.ports, true)).rejects.toThrow(/different data homes/);
    await expect(openUi(broken.ports, true)).rejects.toThrow(/answered 500/);
  });
});

describe('forge start and the browser', () => {
  it('opens the browser once the server answers, not before', async () => {
    const world = createFakeWorld();
    world.files.set(FILES.token, TOKEN);
    comesUp(world, 3_000);

    const code = await startServer(world.ports);

    expect(code).toBe(0);
    expect(world.openCodeCalls).toHaveLength(1);
    expect(world.opened).toEqual([LINK]);
  });

  it('opens the browser for a server that is already running', async () => {
    const world = running();

    await startServer(world.ports);

    expect(world.spawned).toHaveLength(0);
    expect(world.opened).toEqual([LINK]);
  });

  it('opens nothing with open: false', async () => {
    const world = createFakeWorld();
    world.files.set(FILES.token, TOKEN);
    comesUp(world, 0);

    const code = await startServer(world.ports, { open: false });

    expect(code).toBe(0);
    expect(world.opened).toEqual([]);
    expect(world.openCodeCalls).toHaveLength(0);
  });

  it('still succeeds when no sign-in link can be made', async () => {
    const world = createFakeWorld();
    comesUp(world, 0);

    const code = await startServer(world.ports);

    expect(code).toBe(0);
    expect(joined(world.err)).toContain('forge open');
  });
});

describe('forge start waits for a slow server', () => {
  it('waits 60 s by default', () => {
    expect(START_TIMEOUT_MS).toBe(60_000);
  });

  it('accepts a server that comes up after 25 s and shows progress meanwhile', async () => {
    const world = createFakeWorld();
    comesUp(world, 25_000);

    const code = await startServer(world.ports, { open: false });

    expect(code).toBe(0);
    expect(joined(world.out)).toContain('Starting Forge');
    expect(joined(world.out)).toContain('still starting (5 s)');
    expect(joined(world.out)).toContain('still starting (20 s)');
  });

  it('looks once more at the deadline before reporting failure', async () => {
    const world = createFakeWorld();
    world.onSpawn = (w, pid) => w.record({ ...RECORD, pid });
    // 17 polls (every 250 ms up to the 4 s deadline) see nothing; the 18th, the last look, does.
    let probes = 0;
    const ports = {
      ...world.ports,
      health: async (): Promise<'ok' | 'unreachable'> =>
        (probes += 1) > 17 ? 'ok' : 'unreachable',
    };

    const code = await startServer(ports, { open: false, timeoutMs: 4_000 });

    expect(code).toBe(0);
    expect(world.err).toEqual([]);
  });

  it('reports failure when the last look finds nothing', async () => {
    const world = createFakeWorld();

    const code = await startServer(world.ports, { open: false, timeoutMs: 4_000 });

    expect(code).toBe(1);
    expect(joined(world.err)).toContain('did not answer on /health within 4 s');
  });
});
