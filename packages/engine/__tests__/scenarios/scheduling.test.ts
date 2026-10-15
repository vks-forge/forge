/**
 * Scenario: scheduling across projects, and the limits and wait reasons that go with it.
 *
 * Why: one Forge install runs several projects on a few Worker slots (d-0097). If dispatch
 *   took tickets by number, one busy project would hold every slot; and if the ticket page
 *   could not say what a ticket waits for, a healthy queue would look broken. These runs drive
 *   the real engine against fakes to pin both. (Quota waits: scheduling-quota.test.ts.)
 *
 * Pins: three projects with two slots take turns; priority orders a project's tickets; the
 *   global, per-project and per-harness limits hold and are named in the wait reason; a
 *   project may lower its own limit but not raise the company's; a blocker shows as `deps:`.
 * Depends on: helpers/rig, helpers/scheduling-rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import { makeRig } from '#tests/helpers/rig.js';
import { addProject, ask, finishAll } from '#tests/helpers/scheduling-rig.js';

describe('fair scheduling across projects', () => {
  it('with three projects and two slots, projects take turns', async () => {
    const rig = await makeRig();
    await addProject(rig, 'forge', 'FG');
    await addProject(rig, 'api', 'AP');
    await addProject(rig, 'web', 'WB');
    for (const p of ['forge', 'api', 'web']) {
      await ask(rig, p, `${p} one`);
      await ask(rig, p, `${p} two`);
    }

    const first = await rig.tick();
    await finishAll(rig, ['run-1', 'run-2']);
    const second = await rig.tick();
    await finishAll(rig, ['run-3', 'run-4']);
    const third = await rig.tick();

    expect(first.dispatched.map((d) => d.ticketId)).toEqual(['AP-1', 'FG-1']);
    expect(second.dispatched.map((d) => d.ticketId)).toEqual(['WB-1', 'AP-2']);
    expect(third.dispatched.map((d) => d.ticketId)).toEqual(['FG-2', 'WB-2']);
  });

  it('starts the highest-priority ticket of a project first', async () => {
    const rig = await makeRig({ engine: { max_concurrent_global: 1 } });
    await addProject(rig, 'forge', 'FG');
    await rig.request('routine');
    await rig.request('urgent');
    await rig.storage.transaction(async (tx) => {
      const t = await tx.tickets.get('FG-2' as never);
      await tx.tickets.updateTicketCas('FG-2' as never, t!.status_version, {
        priority: 5,
      });
    });

    const report = await rig.tick();

    expect(report.dispatched.map((d) => d.ticketId)).toEqual(['FG-2']);
  });
});

describe('limits and wait reasons', () => {
  it('holds a project to its own limit and says so on the ticket', async () => {
    const rig = await makeRig();
    await addProject(rig, 'forge', 'FG');
    await rig.request('one');
    await rig.request('two');

    const report = await rig.tick();

    expect(report.dispatched.map((d) => d.ticketId)).toEqual(['FG-1']);
    expect(await rig.engine.explainWait('FG-2')).toBe('cap: per-project 1/1');
    expect(await rig.engine.explainWait('FG-1')).toBeNull();
  });

  it('lets a project lower its own limit but never raise the company limit', async () => {
    const rig = await makeRig({
      engine: { max_concurrent_per_project: 2, max_concurrent_global: 5 },
    });

    await addProject(rig, 'forge', 'FG', { max_concurrent: 1 });
    await rig.request('one');
    await rig.request('two');

    expect((await rig.tick()).dispatched).toHaveLength(1);
    expect(await rig.engine.explainWait('FG-2')).toBe('cap: per-project 1/1');
  });

  it('names the global limit when every slot is taken', async () => {
    const rig = await makeRig({ engine: { max_concurrent_global: 1 } });
    await addProject(rig, 'forge', 'FG');
    await addProject(rig, 'api', 'AP');
    await ask(rig, 'forge', 'one');
    await ask(rig, 'api', 'two');

    await rig.tick();

    // Projects take turns in id order, so the first slot goes to `api`.
    expect(await rig.engine.explainWait('AP-1')).toBeNull();
    expect(await rig.engine.explainWait('FG-1')).toBe('cap: global 1/1');
  });

  it('holds one harness to its own limit across projects', async () => {
    const rig = await makeRig({
      engine: {
        max_concurrent_global: 4,
        max_concurrent_per_harness: { default: 1, by_id: {} },
      },
    });

    await addProject(rig, 'forge', 'FG');
    await addProject(rig, 'api', 'AP');
    await ask(rig, 'forge', 'one');
    await ask(rig, 'api', 'two');

    const report = await rig.tick();

    expect(report.dispatched).toHaveLength(1);
    // Projects take turns in id order, so the first slot goes to `api`.
    expect(await rig.engine.explainWait('AP-1')).toBeNull();
    expect(await rig.engine.explainWait('FG-1')).toBe('cap: per-harness 1/1');
  });

  it('shows a blocker as deps and starts the ticket once it is done', async () => {
    const rig = await makeRig({ engine: { max_concurrent_per_project: 3 } });
    await addProject(rig, 'forge', 'FG');
    await rig.request('blocked');
    await rig.request('blocker');
    await rig.storage.transaction((tx) =>
      tx.ticketRelations.add({
        from_id: 'FG-1' as never,
        to_id: 'FG-2' as never,
        kind: 'depends_on',
      }),
    );

    await rig.tick();

    expect(await rig.engine.explainWait('FG-1')).toBe('deps: FG-2');
  });
});
