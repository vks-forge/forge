/**
 * End to end: two projects on one server, registered through the API, run side by side.
 *
 * Why: B4's promise is that one Forge install manages several repositories. This runs the
 *   whole production assembly with two real clones (each with its own bare remote) and
 *   proves they do not leak into each other: each project's tickets use its own prefix,
 *   its own worktree folder under the data home, its own remote and base, and the runs
 *   record their project. A project registered while the server is already serving
 *   another must work without a restart, and archiving one must stop its intake while the
 *   other keeps running.
 *
 * Pins: both tickets (FX-1, SC-1) reach `done`; each change lands only in its own remote;
 *   worktrees are `<dataHome>/worktrees/<slug>/<ticket>`; runs carry `project`; intake for
 *   an archived project is ignored; the other project still takes new tickets.
 * Depends on: helpers/e2e-rig, helpers/fixture-repo. IO: two git repos, SQLite, npm, a loopback socket.
 */

import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { intakeBody, startE2eRig } from '#tests/helpers/e2e-rig.js';
import type { E2eRig } from '#tests/helpers/e2e-rig.js';
import {
  createFixtureRepo,
  fixtureProjectBody,
  git,
} from '#tests/helpers/fixture-repo.js';
import type { FixtureRepo } from '#tests/helpers/fixture-repo.js';
import { waitFor } from '#tests/helpers/wait-for.js';

interface TicketView {
  ticket: {
    id: string;
    status: string;
    project: string;
    worktree?: string;
    branch?: string;
  };
  runs: { project?: string; harness: string }[];
}

describe('two projects on one server', { timeout: 300_000 }, () => {
  let rig: E2eRig;
  let second: FixtureRepo;
  const views = new Map<string, TicketView>();

  const done = (id: string) =>
    waitFor(
      `ticket ${id} to be done`,
      async () => {
        const found = (await rig.call('GET', `/tickets/${id}`)).body as TicketView;

        return found.ticket?.status === 'done' ? found : false;
      },
      240_000,
    );

  beforeAll(async () => {
    rig = await startE2eRig(['good']);
    second = createFixtureRepo();

    // Registered while the server is running: no restart, no config file.
    const added = await rig.call(
      'POST',
      '/projects',
      fixtureProjectBody(second, { slug: 'second', prefix: 'SC' }),
    );

    expect(added.status).toBe(201);

    for (const [project, key] of [
      ['fixture', 'm-1'],
      ['second', 'm-2'],
    ] as const) {
      const res = await rig.call('POST', '/intake', { ...intakeBody(key), project });
      expect(res.status).toBe(202);
    }

    for (const id of ['FX-1', 'SC-1']) {
      views.set(id, await done(id));
    }
  }, 300_000);

  afterAll(async () => {
    await rig.dispose();
    second.dispose();
  });

  it('gives each project its own ticket prefix', () => {
    expect([...views.keys()]).toEqual(['FX-1', 'SC-1']);
    expect(views.get('FX-1')?.ticket.project).toBe('fixture');
    expect(views.get('SC-1')?.ticket.project).toBe('second');
  });

  it("merges each change only into its own project's remote", () => {
    expect(git(rig.fixture.remote, 'show', 'main:src/math.js')).toContain(
      'export function add',
    );

    expect(git(second.remote, 'show', 'main:src/math.js')).toContain(
      'export function add',
    );

    // The branches are named per ticket, so each remote saw only its own ticket's branch.
    const branches = (remote: string) => git(remote, 'branch', '--list');
    expect(branches(rig.fixture.remote)).not.toContain('SC-1');
    expect(branches(second.remote)).not.toContain('FX-1');
  });

  it('runs each ticket in a worktree folder of its own project under the data home', async () => {
    const home = rig.settings.layout.data.worktreesDir;
    const trees = await rig.server.storage.transaction(async (tx) => ({
      fx: await tx.tickets.get('FX-1' as never),
      sc: await tx.tickets.get('SC-1' as never),
    }));

    const norm = (p: string | undefined) => (p ?? '').replaceAll('\\', '/').toLowerCase();

    expect(norm(trees.fx?.worktree)).toBe(norm(join(home, 'fixture', 'FX-1')));
    expect(norm(trees.sc?.worktree)).toBe(norm(join(home, 'second', 'SC-1')));
  });

  it('records the project on every run', () => {
    expect(views.get('FX-1')?.runs.map((r) => r.project)).toEqual(['fixture']);
    expect(views.get('SC-1')?.runs.map((r) => r.project)).toEqual(['second']);
  });

  it('stops intake for an archived project while the other keeps taking tickets', async () => {
    const archived = await rig.call('PATCH', '/projects/second', { status: 'archived' });
    expect(archived.status).toBe(200);

    const refused = await rig.call('POST', '/intake', {
      ...intakeBody('m-3'),
      project: 'second',
    });

    expect(refused.body).toMatchObject({ status: 'ignored' });

    const accepted = await rig.call('POST', '/intake', {
      ...intakeBody('m-4'),
      project: 'fixture',
    });

    expect(accepted.body).toMatchObject({ status: 'ticket_created', ticketId: 'FX-2' });
    await done('FX-2');
  });
});
