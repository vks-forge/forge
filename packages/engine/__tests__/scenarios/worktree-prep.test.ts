/**
 * Scenario: a ticket's worktree is prepared (packages installed) before its Worker starts.
 *
 * Why: Workers may not install packages, so Forge does it first (d-0180). The owner must never
 *   wait on a silent hang or lose work to a missing tool: a slow install shows a wait line and keeps
 *   the ticket's slot without blocking the tick, a failing step parks the ticket with a way
 *   forward (try again, start without setup, cancel) and spends no Worker run, saving new setup
 *   steps resumes it by itself, and a project that needs nothing installed starts at once with no
 *   job at all (d-0176: no language is assumed).
 *
 * Pins: empty plan starts at once; a held install keeps the tick moving, holds the slot and says
 *   what it is doing; a failed step raises one setup escalation with three actions and no run row;
 *   Retry runs setup again; Start without setup stores a skipped record and starts; a newer
 *   settings version resumes by itself; a restored install adds "(restored from cache)" to the ready note; the Worker's PATH gets the tool folders of the record.
 * Depends on: helpers/rig, helpers/fake-preparer, helpers/escalation-rig, vitest.
 */

import { SetupStep } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { cardEventsOf, pendingOf } from '#tests/helpers/escalation-rig.js';
import { createFakePreparer, failure } from '#tests/helpers/fake-preparer.js';
import type { FakePreparer } from '#tests/helpers/fake-preparer.js';
import { makeRig } from '#tests/helpers/rig.js';
import type { Rig, RigOptions } from '#tests/helpers/rig.js';
import type { ProjectRuntime } from '#/types/verify.types.js';

async function rigWith(
  prep: FakePreparer | undefined,
  opts: RigOptions = {},
): Promise<Rig> {
  const rig = await makeRig(opts);
  rig.runtime.current = {
    ...(rig.runtime.current as ProjectRuntime),
    ...(prep ? { prepare: prep } : {}),
  };

  return rig;
}

const OK = (prep: FakePreparer) => prep.skip('ok', { steps: [], source: 'detected' });

describe('a project with nothing to install', () => {
  it('starts at once: no job, no prepare, no record', async () => {
    const prep = createFakePreparer(false);
    const rig = await rigWith(prep);
    const id = await rig.request('Do the thing');

    await rig.tick();

    expect(rig.driver.starts).toHaveLength(1);
    expect((await rig.ticket(id)).status).toBe('in_progress');
    expect(prep.ran).toEqual([]);
  });

  it('starts at once when the runtime has no preparer at all', async () => {
    const rig = await rigWith(undefined);
    await rig.request('Do the thing');

    await rig.tick();

    expect(rig.driver.starts).toHaveLength(1);
  });
});

describe('a slow install', () => {
  it('does not block the tick, names the step, holds the slot and then starts the Worker', async () => {
    const prep = createFakePreparer();
    const release = prep.hold();
    const rig = await rigWith(prep, { engine: { max_concurrent_global: 1 } });
    const first = await rig.request('First');
    const second = await rig.request('Second');

    await rig.tick();
    await rig.tick();

    expect(rig.driver.starts).toHaveLength(0);
    expect((await rig.ticket(first)).status).toBe('planned');
    expect(await rig.engine.explainWait(first)).toMatch(
      /^Getting the workspace ready: Install packages \(\d+:\d\d\)$/,
    );

    // The preparing ticket still holds its Worker slot: the next ticket waits on the cap.
    expect(await rig.engine.explainWait(second)).toBe('cap: global 1/1');

    release();
    await rig.flush();
    await rig.tick();

    expect(rig.driver.starts).toHaveLength(1);
    expect((await rig.ticket(first)).status).toBe('in_progress');
    expect(prep.ran).toEqual(['/repo/.worktrees/FG-1']);
    const notes = await cardEventsOf(rig, (await rig.ticket(first)).card_id, 'note');
    expect(notes.map((n) => n.payload.text)).toContain('FG-1 workspace ready in 1 s');
  });

  it('says so when the install was restored from the setup cache', async () => {
    const prep = createFakePreparer();
    prep.restored = true;
    const rig = await rigWith(prep);
    const id = await rig.request('First');

    await rig.tick();
    await rig.flush();
    await rig.tick();

    const notes = await cardEventsOf(rig, (await rig.ticket(id)).card_id, 'note');
    expect(notes.map((n) => n.payload.text)).toContain(
      'FG-1 workspace ready in 1 s (restored from cache)',
    );
  });

  it('remembers the worktree on the ticket so a cancel can clean it', async () => {
    const prep = createFakePreparer();
    prep.hold();
    const rig = await rigWith(prep);
    const id = await rig.request('First');

    await rig.tick();

    expect(await rig.ticket(id)).toMatchObject({
      worktree: '/repo/.worktrees/FG-1',
      status: 'planned',
    });
  });
});

describe('a failing install', () => {
  async function failed() {
    const prep = createFakePreparer();
    prep.result = failure();
    const rig = await rigWith(prep);
    const id = await rig.request('Do the thing');
    await rig.tick();
    const [row] = await pendingOf(rig, id, 'setup');

    return { prep, rig, id, row: row! };
  }

  it('parks the ticket with one owner setup escalation and spends no Worker run', async () => {
    const { rig, id, row } = await failed();

    expect(rig.driver.starts).toHaveLength(0);
    expect((await rig.ticket(id)).status).toBe('waiting_human');
    expect(row.escalated_at).toBeDefined();
    expect(row.payload).toMatchObject({
      kind: 'setup',
      cause: {
        type: 'worktree_setup',
        step: 'Install packages',
        command: 'pnpm install --frozen-lockfile',
        exit_code: 1,
        timed_out: false,
        tail: 'ERR_PNPM_OUTDATED_LOCKFILE',
      },
      fix_href: '/p/forge/settings/checks#setup',
    });

    const runs = await rig.storage.transaction((tx) => tx.runs.listByTicket(id));
    expect(runs).toEqual([]);

    // Retry, Start without setup and Cancel are offered; "I fixed it" is not (the settings version decides that).
    const offered = await rig.engine.actOnEscalation(
      row.id,
      { action: 'recheck' },
      'owner',
    );

    expect(offered.status).toBe('action_not_offered');
  });

  it('Try again runs setup again, parks again while it fails and starts the Worker once it passes', async () => {
    const { prep, rig, id, row } = await failed();
    prep.result = failure({ exit_code: 2 });
    await rig.engine.actOnEscalation(row.id, { action: 'retry' }, 'owner');
    await rig.tick();

    const [again] = await pendingOf(rig, id, 'setup');
    expect(again!.payload).toMatchObject({ cause: { exit_code: 2 } });

    prep.result = { ok: true, prep: await OK(prep) };
    await rig.engine.actOnEscalation(again!.id, { action: 'retry' }, 'owner');
    await rig.tick();

    expect(rig.driver.starts).toHaveLength(1);
    expect(prep.ran).toHaveLength(3);
  });

  it('Start without setup stores a skipped record and starts the Worker', async () => {
    const { prep, rig, id, row } = await failed();

    const out = await rig.engine.actOnEscalation(
      row.id,
      { action: 'skip_setup' },
      'owner',
    );

    await rig.tick();

    expect(out.status).toBe('done');
    expect(prep.skipped).toEqual(['/repo/.worktrees/FG-1']);
    expect(rig.driver.starts).toHaveLength(1);
    expect((await rig.ticket(id)).status).toBe('in_progress');
    const notes = await cardEventsOf(rig, (await rig.ticket(id)).card_id, 'note');
    expect(notes.map((n) => n.payload.text)).toContain(
      'FG-1 workspace: setup skipped by owner',
    );
  });

  it('resumes by itself when the owner saves new setup steps', async () => {
    const { prep, rig, id } = await failed();
    await rig.tick();
    expect((await rig.ticket(id)).status).toBe('waiting_human');

    prep.result = { ok: true, prep: await OK(prep) };
    const { version } = await rig.config.project('forge');
    await rig.config.append({
      scope: 'project',
      project: 'forge',
      doc: { setup: [SetupStep.parse({ name: 'Install', command: 'true' })] },
      author: 'owner',
      reason: 'fix setup',
      expectedVersion: version.project,
    });

    await rig.tick();

    expect(rig.driver.starts).toHaveLength(1);
    const settled = await cardEventsOf(
      rig,
      (await rig.ticket(id)).card_id,
      'escalation_settled',
    );

    expect(settled.at(-1)!.payload).toMatchObject({ action: 'recheck', by: 'auto' });
  });
});

describe('the tool folders of a prepared tree', () => {
  it('go first on the Worker PATH', async () => {
    const prep = createFakePreparer();
    const rig = await rigWith(prep);
    const record = {
      key: 'b'.repeat(64),
      status: 'ready' as const,
      outputs: [],
      path: ['/repo/.worktrees/FG-1/.venv/bin'],
      steps: [],
      at: '2026-10-21T00:00:00.000Z',
    };

    rig.worktrees.readPrep = async () => record;
    await rig.request('Do the thing');

    await rig.tick();

    expect(rig.driver.starts[0]?.pathPrepend).toEqual([
      '/repo/.worktrees/FG-1/.venv/bin',
    ]);
  });
});
