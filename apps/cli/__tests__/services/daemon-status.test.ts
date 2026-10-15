/**
 * `forge status` against a scripted machine.
 *
 * Why: before filing work the user needs a one-glance answer, and a script needs an exit code: 0 running, 3 not running, never a report of a stale `server.json` as a live server.
 *
 * Pins: running output, degraded health, no record, stale record, silent process, uptime text.
 * Depends on: src/services/daemon/server-status, helpers/fake-daemon. No IO.
 */

import { describe, expect, it } from 'vitest';
import { describeUptime, serverStatus } from '#/services/daemon/server-status.js';
import { RECORD, createFakeWorld, joined } from '#tests/helpers/fake-daemon.js';

describe('forge status', () => {
  it('prints url, pid, uptime and version of a running server and exits 0', async () => {
    const world = createFakeWorld();
    world.record(RECORD);
    world.alive.add(RECORD.pid);
    world.healthByPort.set(RECORD.port, 'ok');

    const code = await serverStatus(world.ports);

    expect(code).toBe(0);
    expect(joined(world.out)).toBe(
      [
        'Forge is running',
        '  url:     http://127.0.0.1:4310',
        '  pid:     4242',
        '  uptime:  2h 3m',
        '  version: 0.0.0',
        '',
      ].join('\n'),
    );
  });

  it('flags a degraded database', async () => {
    const world = createFakeWorld();
    world.record(RECORD);
    world.alive.add(RECORD.pid);
    world.healthByPort.set(RECORD.port, 'degraded');

    const code = await serverStatus(world.ports);

    expect(code).toBe(0);
    expect(joined(world.out)).toContain('health:  degraded');
  });

  it.each([
    ['no record', undefined, 'Forge is not running\n'],
    [
      'a stale record',
      { ...RECORD, pid: 77 },
      'Forge is not running (server.json is left over from process 77, which has ended)\n',
    ],
  ])('says not running for %s and exits 3', async (_name, record, text) => {
    const world = createFakeWorld();
    if (record) {
      world.record(record);
    }

    const code = await serverStatus(world.ports);

    expect(code).toBe(3);
    expect(joined(world.out)).toBe(text);
  });

  it('describes a live process that gives no health', async () => {
    const world = createFakeWorld();
    world.record(RECORD);
    world.alive.add(RECORD.pid);

    const code = await serverStatus(world.ports);

    expect(code).toBe(3);
    expect(joined(world.out)).toContain('Forge is not answering');
  });

  it.each([
    [0, '0s'],
    [7_000, '7s'],
    [65_000, '1m 5s'],
    [3_723_000, '1h 2m'],
    [90_000_000, '1d 1h'],
    [-5_000, '0s'],
  ])('writes %i ms as %s', (ms, text) => {
    expect(describeUptime(ms)).toBe(text);
  });
});
