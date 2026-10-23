/**
 * Verify sync tests: main is merged into a ticket's branch before it is gated, and a clash goes to its writer.
 *
 * Why: tickets run side by side, so main usually moves before a ticket is verified. Without a sync
 *   the PR came out unmergeable, the owner's Retry re-parked it with no Worker, and the only way out
 *   was re-planning the whole card (eval fix 4). Each case pins one promise of the new road: a branch
 *   that already holds main is gated as before; a clean merge is pushed and gated on the merged head;
 *   a clash is committed by the adapter (never pushed), costs a conflict (not a gate rework), and wakes
 *   the ticket's writer once with the files and the titles of the tickets that changed them first; and
 *   at the cap the owner gets a merge_conflict failure that names the clash instead of a loop.
 *
 * Pins: up_to_date -> gates and merge, merged -> commit, then merge-in, then push and G1 on the new
 *   head, conflict -> no push, `conflict_found`, one continuation wake (files, upstream ticket title)
 *   and a card note, a marker G1 failure -> the same clash road, cap -> failure escalation with a
 *   `conflict` payload and no gate rework spent.
 * Also pins: the gates diff from the new base tip after a merge (a user commit on main is not the Worker's change).
 * Depends on: helpers/verify-rig, helpers/escalation-rig, helpers/fake-git-host, @forge/core, vitest.
 */

import { describe, expect, it } from 'vitest';
import { MAX_CONFLICT_RESOLVES } from '@forge/core';
import type { MergeInResult } from '@forge/core';
import { cardEventsOf, pendingOf } from '#tests/helpers/escalation-rig.js';
import { verdict } from '#tests/helpers/fake-git-host.js';
import { makeVerifyRig, startAndFinish } from '#tests/helpers/verify-rig.js';
import type { VerifyRig } from '#tests/helpers/verify-rig.js';

const CONFLICT: MergeInResult = {
  kind: 'conflict',
  head: 'checkpoint-sha',
  files: [{ path: 'src/cli.ts', binary: false }],
  upstream: [
    { sha: 'abcdef0123456789', subject: 'feat(FG-7): Add the export flag (#3)' },
  ],
};

/** Puts a finished earlier ticket in storage so the clash can name it. */
async function seedUpstream(v: VerifyRig, like: string): Promise<void> {
  const first = await v.rig.ticket(like);
  await v.rig.storage.transaction((tx) =>
    tx.tickets.insert({
      ...first,
      id: 'FG-7' as typeof first.id,
      title: 'Add the export flag',
      body: 'Add --export to the cli.',
      status: 'done',
      blocked_by: [],
    }),
  );
}

const deltas = (v: VerifyRig): string[] =>
  v.rig.llm.callsTo('dispatch_prompt').map((c) => JSON.stringify(c.input));

describe('verify sync: base already in the branch', () => {
  it('gates and merges as before, after asking the host for the base tip', async () => {
    const v = await makeVerifyRig();
    const id = await startAndFinish(v.rig);

    await v.rig.tick();

    expect((await v.rig.ticket(id)).status).toBe('done');
    expect(v.rig.worktrees.merges).toEqual([
      {
        path: '/repo/.worktrees/FG-1',
        sha: 'base-sha-1',
        message: 'Merge main into fix/FG-1-scripted-triage-title',
      },
    ]);

    expect(v.gate.contexts).toHaveLength(1);
  });
});

describe('verify sync: a clean merge', () => {
  it('commits first, merges, then pushes and gates the merged head', async () => {
    const v = await makeVerifyRig();
    v.rig.worktrees.mergeResult = { kind: 'merged', head: 'merged-head' };
    v.rig.worktrees.headSha = 'merged-head';
    v.host.headSha = 'merged-head';
    const id = await startAndFinish(v.rig);

    await v.rig.tick();

    expect(v.rig.worktrees.commits).toHaveLength(1);
    expect(v.rig.worktrees.merges).toHaveLength(1);
    expect(v.host.calls.some((c) => c.startsWith('push:'))).toBe(true);
    expect(v.host.mergeShas).toEqual(['merged-head']);
    const notes = await cardEventsOf(v.rig, (await v.rig.ticket(id)).card_id, 'note');
    expect(notes.map((n) => n.payload.text)).toContain(
      'Main moved; Forge merged it into FG-1 and is re-checking.',
    );
  });
});

describe('verify sync: the base the gates diff from', () => {
  it('is the new base tip once main was merged in, so commits from main are not blamed on the Worker', async () => {
    const v = await makeVerifyRig();
    v.host.baseTip = { ref: 'refs/forge/base/main', sha: 'moved-tip' };
    v.rig.worktrees.mergeResult = { kind: 'merged', head: 'merged-head' };
    v.rig.worktrees.headSha = 'merged-head';
    v.host.headSha = 'merged-head';
    await startAndFinish(v.rig);

    await v.rig.tick();

    expect(v.gate.contexts.map((c) => c.baseSha)).toEqual(['moved-tip']);
  });

  it('stays the worktree base when the branch already held main', async () => {
    const v = await makeVerifyRig();
    await startAndFinish(v.rig);

    await v.rig.tick();

    expect(v.gate.contexts.map((c) => c.baseSha)).toEqual(['base-sha-1']);
  });
});

describe('verify sync: a clash', () => {
  it('sends the ticket back to its writer once, with the files and the upstream ticket, and pushes nothing', async () => {
    const v = await makeVerifyRig();
    v.rig.worktrees.mergeResult = CONFLICT;
    const id = await startAndFinish(v.rig);
    await seedUpstream(v, id);

    await v.rig.tick();

    const t = await v.rig.ticket(id);
    expect(t).toMatchObject({ conflict_count: 1, rework_count: 0 });
    expect(['in_progress']).toContain(t.status);
    expect(v.host.count('push')).toBe(0);
    expect(v.gate.contexts).toHaveLength(0);
    expect(v.rig.driver.starts).toHaveLength(2);
    const delta = deltas(v)[1]!;
    expect(delta).toContain('merge_conflict');
    expect(delta).toContain('src/cli.ts');
    expect(delta).toContain('Add the export flag');
    expect(delta).toContain('FG-7');
    expect(delta).not.toContain('rejected by the verification gates');
    const notes = await cardEventsOf(v.rig, t.card_id, 'note');
    expect(notes.map((n) => n.payload.text)).toContain(
      'FG-1 clashes with FG-7 in src/cli.ts; the Worker is combining both changes.',
    );
  });

  it('treats a resolver that left markers as the same clash, not a failed check', async () => {
    const v = await makeVerifyRig();
    v.gate.script(
      verdict('failed', [
        { check: 'conflict-markers', file: 'src/cli.ts', message: 'src/cli.ts: markers' },
      ]),
    );

    const id = await startAndFinish(v.rig);
    await v.rig.tick();

    const t = await v.rig.ticket(id);
    expect(t).toMatchObject({ conflict_count: 1, rework_count: 0 });
    expect(deltas(v)[1]).toContain('merge_conflict');
    expect(deltas(v)[1]).toContain('src/cli.ts');
  });

  it('at the cap, parks with a merge_conflict failure that names the clash and starts no run', async () => {
    const v = await makeVerifyRig();
    v.rig.worktrees.mergeResult = CONFLICT;
    const id = await startAndFinish(v.rig);
    await seedUpstream(v, id);
    const before = await v.rig.ticket(id);
    await v.rig.storage.transaction((tx) =>
      tx.tickets.updateTicketCas(id as typeof before.id, before.status_version, {
        conflict_count: MAX_CONFLICT_RESOLVES,
      }),
    );

    await v.rig.tick();

    const t = await v.rig.ticket(id);
    expect(t.status).toBe('waiting_human');
    expect(t.parked_from).toBeUndefined();
    expect(t.blocked_reason?.startsWith('merge conflict:')).toBe(true);
    expect(t).toMatchObject({ conflict_count: MAX_CONFLICT_RESOLVES, rework_count: 0 });
    expect(v.rig.driver.starts).toHaveLength(1);
    const [row] = await pendingOf(v.rig, id, 'failure');
    expect(row!.payload).toMatchObject({
      kind: 'failure',
      cause: 'merge_conflict',
      conflict: {
        files: ['src/cli.ts'],
        upstream: [{ ticket_id: 'FG-7', title: 'Add the export flag' }],
      },
    });
  });
});
