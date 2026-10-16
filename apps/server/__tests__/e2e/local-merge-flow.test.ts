/**
 * End to end: projects on folders with no remote merge their verified work locally (d-0124).
 *
 * Why: the promise of "Forge works on every folder" is only true if the whole pipeline runs
 *   with the agents and no GitHub: register (git started by Forge when absent), dispatch into
 *   a worktree, a Worker, the real G1 gate, and a merge into the user's own branch that never
 *   costs them uncommitted work. These scenarios run the production assembly with only the
 *   Worker harness and the Director's model scripted, over real folders and real git.
 *
 * Pins: a folder with no git is snapshotted at registration and an Express ticket ends `done`
 *   with the change in `main` and in the user's working tree; a dirty checked-out base parks
 *   the ticket in "Needs you" with a commit-or-stash message, moves nothing, and merges after
 *   the user commits and releases it; an init-only project parks with a first-commit message,
 *   starts no Worker, and runs once the user has committed; a project scoped to a subfolder
 *   runs its Worker in that subfolder and merges only there.
 * Depends on: helpers/e2e-rig, helpers/fixture-repo. IO: git, SQLite, npm, a loopback socket.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toTicketPatch, transition } from '@forge/core';
import type { TicketId } from '@forge/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { intakeBody, startE2eRig } from '#tests/helpers/e2e-rig.js';
import type { E2eRig } from '#tests/helpers/e2e-rig.js';
import {
  createPlainFixture,
  createSubfolderFixture,
  fixtureProjectBody,
  git,
} from '#tests/helpers/fixture-repo.js';
import type { FixtureRepo } from '#tests/helpers/fixture-repo.js';
import { waitFor } from '#tests/helpers/wait-for.js';

interface TicketView {
  ticket: { id: string; status: string; blocked_reason?: string };
  gate_results: { gate: string; status: string }[];
}

const WHO = ['-c', 'user.name=Owner', '-c', 'user.email=owner@example.com'];

/** The registration body for a project with no remote: no `git_host`, no connection. */
function localBody(
  fixture: FixtureRepo,
  over: Record<string, unknown>,
): Record<string, unknown> {
  const body = fixtureProjectBody(fixture, over);
  delete body['git_host'];
  delete body['base_branch'];

  return body;
}

const ticketOf = async (rig: E2eRig): Promise<TicketView> =>
  (await rig.call('GET', '/tickets/FX-1')).body as TicketView;

const reach = (rig: E2eRig, status: string, ms = 240_000) =>
  waitFor(
    `ticket FX-1 to be ${status}`,
    async () => {
      const found = await ticketOf(rig);

      return found.ticket.status === status ? found : false;
    },
    ms,
  );

/** What the user's "release" button does to a parked ticket (state machine `unparked`). */
async function release(rig: E2eRig, id: string): Promise<void> {
  await rig.server.storage.transaction(async (tx) => {
    const ticket = await tx.tickets.get(id as TicketId);
    if (!ticket) {
      throw new Error(`no ticket ${id}`);
    }

    const next = transition(ticket, { type: 'unparked', at: new Date().toISOString() });
    if (!next.ok) {
      throw new Error(`cannot release ${id}: ${JSON.stringify(next.error)}`);
    }

    await tx.tickets.updateTicketCas(
      ticket.id,
      ticket.status_version,
      toTicketPatch(next.value),
    );
  });
}

const report = async (rig: E2eRig, error: unknown): Promise<Error> =>
  new Error(
    [
      String(error),
      JSON.stringify((await rig.call('GET', '/tickets/FX-1')).body),
      ...rig.logs,
      ...rig.worker.failures,
    ].join('\n'),
  );

describe('a folder with no git, snapshot at registration', { timeout: 300_000 }, () => {
  let rig: E2eRig;
  let fixture: FixtureRepo;
  let snapshot = '';
  let view: TicketView;

  beforeAll(async () => {
    fixture = createPlainFixture();
    rig = await startE2eRig(['good'], {
      fixture,
      register: (f) =>
        localBody(f, { local_path: f.root, git_setup: { mode: 'snapshot' } }),
    });

    snapshot = git(fixture.root, 'rev-parse', 'main');
    await rig.call('POST', '/intake', intakeBody('local-1'));
    try {
      view = await reach(rig, 'done');
    } catch (error) {
      throw await report(rig, error);
    }
  }, 300_000);

  afterAll(async () => {
    await rig.dispose();
    fixture.dispose();
  });

  it('ends done with G1 passed and a Worker that never ran in the user folder', () => {
    expect(view.gate_results.filter((g) => g.gate === 'G1').map((g) => g.status)).toEqual(
      ['passed'],
    );

    expect(rig.worker.failures).toEqual([]);
    expect(rig.worker.requests[0]?.cwd.replaceAll('\\', '/')).not.toBe(
      fixture.root.replaceAll('\\', '/'),
    );
  });

  it('lands one squash commit on main, on top of the snapshot', () => {
    expect(git(fixture.root, 'log', '--format=%s', 'main').split('\n')).toHaveLength(2);
    expect(git(fixture.root, 'rev-parse', 'main~1')).toBe(snapshot);
    expect(git(fixture.root, 'show', 'main:src/math.js')).toContain(
      'export function add',
    );
  });

  it('puts the change in the user working tree and leaves it clean', () => {
    expect(readFileSync(join(fixture.root, 'src', 'math.js'), 'utf8')).toContain(
      'export function add',
    );

    expect(git(fixture.root, 'status', '--porcelain')).toBe('');
  });
});

describe('a dirty checked-out base waits for the user', { timeout: 300_000 }, () => {
  let rig: E2eRig;
  let fixture: FixtureRepo;

  beforeAll(async () => {
    fixture = createPlainFixture();
    rig = await startE2eRig(['good'], {
      fixture,
      register: (f) =>
        localBody(f, { local_path: f.root, git_setup: { mode: 'snapshot' } }),
    });
  }, 120_000);

  afterAll(async () => {
    await rig.dispose();
    fixture.dispose();
  });

  it('parks in Needs you, moves nothing, and merges once the user commits and releases it', async () => {
    const before = git(fixture.root, 'rev-parse', 'main');
    const lint = join(fixture.root, 'scripts', 'lint.mjs');
    const original = readFileSync(lint, 'utf8');
    const edited = `${original}// my local note\n`;
    // The user is mid-edit on a tracked file when the ticket finishes.
    writeFileSync(lint, edited);

    await rig.call('POST', '/intake', intakeBody('local-2'));
    let parked: TicketView;
    try {
      parked = await reach(rig, 'waiting_human');
    } catch (error) {
      throw await report(rig, error);
    }

    expect(parked.ticket.blocked_reason).toMatch(/commit or stash/);
    expect(git(fixture.root, 'rev-parse', 'main')).toBe(before);
    expect(readFileSync(lint, 'utf8')).toBe(edited);

    git(fixture.root, ...WHO, 'commit', '-am', 'my note');
    await release(rig, 'FX-1');
    await reach(rig, 'done');

    expect(git(fixture.root, 'show', 'main:src/math.js')).toContain(
      'export function add',
    );

    expect(readFileSync(lint, 'utf8')).toBe(edited);
  });
});

describe('an init-only project', { timeout: 300_000 }, () => {
  let rig: E2eRig;
  let fixture: FixtureRepo;

  beforeAll(async () => {
    fixture = createPlainFixture();
    rig = await startE2eRig(['good'], {
      fixture,
      register: (f) =>
        localBody(f, { local_path: f.root, git_setup: { mode: 'init_only' } }),
    });
  }, 120_000);

  afterAll(async () => {
    await rig.dispose();
    fixture.dispose();
  });

  it('refuses to dispatch until there is a first commit, then runs', async () => {
    await rig.call('POST', '/intake', intakeBody('local-3'));
    let parked: TicketView;
    try {
      parked = await reach(rig, 'waiting_human');
    } catch (error) {
      throw await report(rig, error);
    }

    expect(parked.ticket.blocked_reason).toMatch(/no commit yet.*first commit/);
    expect(rig.worker.started).toEqual([]);

    git(fixture.root, 'add', '-A');
    git(fixture.root, ...WHO, 'commit', '-m', 'first commit');
    await release(rig, 'FX-1');
    await reach(rig, 'done');

    expect(git(fixture.root, 'show', 'main:src/math.js')).toContain(
      'export function add',
    );
  });
});

describe('a project scoped to a subfolder', { timeout: 300_000 }, () => {
  let rig: E2eRig;
  let fixture: FixtureRepo;

  beforeAll(async () => {
    fixture = createSubfolderFixture();
    rig = await startE2eRig(['good'], {
      fixture,
      register: (f) =>
        localBody(f, { local_path: join(f.root, 'app'), scope: { mode: 'subfolder' } }),
    });
  }, 120_000);

  afterAll(async () => {
    await rig.dispose();
    fixture.dispose();
  });

  it('runs the Worker in the subfolder and merges the change only there', async () => {
    await rig.call('POST', '/intake', intakeBody('local-4'));
    try {
      await reach(rig, 'done');
    } catch (error) {
      throw await report(rig, error);
    }

    expect(rig.worker.requests[0]?.cwd.replaceAll('\\', '/')).toMatch(/\/FX-1\/app$/);
    expect(git(fixture.root, 'show', 'main:app/src/math.js')).toContain(
      'export function add',
    );

    expect(
      git(fixture.root, 'diff', '--name-only', 'main~1', 'main').split('\n'),
    ).toEqual(['app/src/math.js', 'app/test/math.test.js']);

    expect(readFileSync(join(fixture.root, 'README.md'), 'utf8')).toBe(
      'not the project\n',
    );
  });
});
