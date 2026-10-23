/**
 * End to end: a ticket whose branch clashes with main is combined by its own Worker and merges (eval fix 4).
 *
 * Why: in the eval, FR-8 and FR-6 both changed `src/cli.ts`; FR-6 merged first and FR-8 parked as
 *   "policy_denied", Retry did nothing, and the only way out was re-planning the card. Now Forge
 *   merges main into the ticket's branch when it verifies, leaves the clash in the files as git
 *   markers, and wakes the same Worker to combine both changes; G1 refuses any marker that is left.
 *   These scenarios run the production assembly (real git, local bare host, real G1, real hooks and
 *   receipts) with only the Worker's edits and the Director's model scripted. The files are plain
 *   `.txt`: the conflict road needs no ecosystem tooling (d-0176). The ticket that "merged first" is
 *   a commit pushed to the remote while the Worker is working, named the way Forge's squash commits
 *   are: the project runs one Worker at a time, so a second live ticket could not be held back
 *   deterministically, and the engine sees the same thing either way.
 *
 * Pins: a clash ends with both edits in main and no markers, the resolver sees the markers and is
 *   told the conflict rule, the ticket costs a conflict and no rework, and its worktree and branch are
 *   gone; non-overlapping edits of one file merge cleanly with no extra Worker run and gate the merged
 *   head; a resolver that leaves markers twice parks the ticket with a merge_conflict failure and Retry
 *   starts one more resolver run that finishes the job.
 * Depends on: helpers/e2e-rig, helpers/fake-text-worker, helpers/fixture-repo, helpers/temp.
 *   IO: git, SQLite, a loopback socket.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { intakeBody, startE2eRig } from '#tests/helpers/e2e-rig.js';
import type { E2eRig } from '#tests/helpers/e2e-rig.js';
import { createTextWorker } from '#tests/helpers/fake-text-worker.js';
import type { TextScript } from '#tests/helpers/fake-text-worker.js';
import { fixtureProjectBody, git } from '#tests/helpers/fixture-repo.js';
import type { FixtureRepo } from '#tests/helpers/fixture-repo.js';
import { makeCanonicalTempDir, trackTemp } from '#tests/helpers/temp.js';
import { waitFor } from '#tests/helpers/wait-for.js';

interface TicketView {
  ticket: { id: string; status: string; conflict_count?: number; rework_count: number };
  wait_actions: string[];
  escalations: {
    id: string;
    payload: { cause?: string; conflict?: { files: string[] } };
  }[];
}

const WHO = ['-c', 'user.name=Other', '-c', 'user.email=other@example.com'];
const BASE = 'line one\nshared line\nline three\n';
const SPREAD = `${Array.from({ length: 10 }, (_, i) => `row ${i + 1}`).join('\n')}\n`;
/** What `git show` prints for the combined file (git() trims the final newline). */
const COMBINED = 'line one\nalpha edit and beta edit\nline three';
const MARKERS = /^(<<<<<<<|>>>>>>>) /m;

/** A repository of one `notes.txt` with a bare remote: nothing a language tool would recognise. */
function createTextFixture(initial: string): FixtureRepo {
  const root = makeCanonicalTempDir('forge-text-fixture-');
  const remote = `${root}-remote.git`;
  const dataHome = `${root}-home`;
  trackTemp(remote);
  trackTemp(dataHome);
  writeFileSync(join(root, 'notes.txt'), initial);
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Fixture');
  git(root, 'config', 'user.email', 'fixture@localhost');
  git(root, 'config', 'core.autocrlf', 'false');
  git(root, 'add', '-A');
  git(root, 'commit', '-m', 'fixture: initial commit');
  mkdirSync(remote, { recursive: true });
  git(remote, 'init', '--bare', '-b', 'main');
  git(root, 'push', remote, 'main');

  return { root, remote, dataHome, dispose: () => undefined };
}

/** The earlier ticket merging first: a commit on the remote's main, as Forge's squash commits are named. */
function mergeUpstream(fixture: FixtureRepo, text: string): void {
  const clone = makeCanonicalTempDir('forge-upstream-');
  git(clone, 'clone', fixture.remote, 'work');
  const work = join(clone, 'work');
  writeFileSync(join(work, 'notes.txt'), text);
  git(work, ...WHO, 'commit', '-am', 'feat(FX-9): Change notes first (#1)');
  git(work, 'push', 'origin', 'main');
}

async function start(
  initial: string,
  script: (fixture: FixtureRepo) => TextScript,
): Promise<{ rig: E2eRig; fixture: FixtureRepo }> {
  const fixture = createTextFixture(initial);
  const rig = await startE2eRig([], {
    fixture,
    worker: (deps, getServer) => createTextWorker(deps, getServer, script(fixture)),
    register: (f) =>
      fixtureProjectBody(f, {
        settings: { checks: [], default_harness: 'claude-code' },
      }),
  });

  await rig.call('POST', '/intake', intakeBody('conflict-1'));

  return { rig, fixture };
}

const viewOf = async (rig: E2eRig): Promise<TicketView> =>
  (await rig.call('GET', '/tickets/FX-1')).body as TicketView;

const reach = (rig: E2eRig, status: string) =>
  waitFor(
    `ticket FX-1 to be ${status}`,
    async () => {
      const found = await viewOf(rig);

      return found.ticket.status === status ? found : false;
    },
    240_000,
  );

const reachOrReport = async (rig: E2eRig, status: string): Promise<TicketView> => {
  try {
    return await reach(rig, status);
  } catch (error) {
    throw new Error(
      [
        String(error),
        JSON.stringify((await rig.call('GET', '/tickets/FX-1')).body),
        ...rig.logs.slice(-40),
        ...rig.worker.failures,
      ].join('\n'),
    );
  }
};

describe('a clash on the same line', { timeout: 300_000 }, () => {
  let rig: E2eRig;
  let fixture: FixtureRepo;
  const seen: string[] = [];
  let view: TicketView;

  beforeAll(async () => {
    ({ rig, fixture } = await start(BASE, (f) => (run) => {
      if (run.index === 0) {
        mergeUpstream(f, 'line one\nalpha edit\nline three\n');

        return { 'notes.txt': 'line one\nbeta edit\nline three\n' };
      }

      seen.push(run.read('notes.txt'));

      return { 'notes.txt': 'line one\nalpha edit and beta edit\nline three\n' };
    }));

    view = await reachOrReport(rig, 'done');
  }, 300_000);

  afterAll(async () => {
    await rig.dispose();
  });

  it('lands both edits in main with no marker left', () => {
    const text = git(fixture.remote, 'show', 'main:notes.txt');

    expect(text).toBe(COMBINED);
    expect(MARKERS.test(text)).toBe(false);
    expect(git(fixture.remote, 'log', '--format=%s', 'main').split('\n')).toHaveLength(3);
  });

  it('showed the resolver the markers, told it the conflict rule, and spent a conflict not a rework', () => {
    expect(rig.worker.failures).toEqual([]);
    expect(rig.worker.started).toHaveLength(2);
    expect(MARKERS.test(seen[0] ?? '')).toBe(true);
    expect(rig.worker.requests[1]?.prompt).toContain('Keep both intents');
    expect(rig.worker.requests[0]?.prompt).not.toContain('Keep both intents');
    expect(view.ticket).toMatchObject({ conflict_count: 1, rework_count: 0 });
  });

  it('removes the worktree and the branch', async () => {
    // Cleanup follows the merge in the same tick; poll so a slow disk cannot race the read.
    await waitFor(
      'the ticket branch and worktree to be gone',
      () =>
        git(fixture.remote, 'branch', '--list').trim() === '* main' &&
        git(fixture.root, 'worktree', 'list').split('\n').length === 1,
      30_000,
    );
  });
});

describe('edits that do not overlap', { timeout: 300_000 }, () => {
  let rig: E2eRig;
  let fixture: FixtureRepo;

  beforeAll(async () => {
    ({ rig, fixture } = await start(SPREAD, (f) => (run) => {
      mergeUpstream(f, SPREAD.replace('row 1\n', 'row 1 by the other ticket\n'));

      return {
        'notes.txt': run.read('notes.txt').replace('row 10\n', 'row 10 by this one\n'),
      };
    }));

    await reachOrReport(rig, 'done');
  }, 300_000);

  afterAll(async () => {
    await rig.dispose();
  });

  it('merges cleanly with no extra Worker run and both edits in main', () => {
    const text = git(fixture.remote, 'show', 'main:notes.txt');

    expect(rig.worker.failures).toEqual([]);
    expect(rig.worker.started).toHaveLength(1);
    expect(text).toContain('row 1 by the other ticket');
    expect(text).toContain('row 10 by this one');
  });

  it('gated the merged head, not the head the Worker left', async () => {
    const rows = await rig.server.storage.transaction((tx) =>
      tx.gateResults.listByTicket('FX-1'),
    );

    const g1 = rows.filter((r) => r.gate === 'G1');
    expect(g1.map((r) => r.status)).toEqual(['passed']);
    const parents = git(fixture.root, 'cat-file', '-p', g1[0]?.head_sha ?? 'missing')
      .split('\n')
      .filter((l) => l.startsWith('parent '));

    expect(parents).toHaveLength(2);
  });
});

describe('a resolver that leaves the markers behind', { timeout: 300_000 }, () => {
  let rig: E2eRig;
  let fixture: FixtureRepo;

  beforeAll(async () => {
    ({ rig, fixture } = await start(BASE, (f) => (run) => {
      if (run.index === 0) {
        mergeUpstream(f, 'line one\nalpha edit\nline three\n');

        return { 'notes.txt': 'line one\nbeta edit\nline three\n' };
      }

      if (run.index < 3) {
        // Twice the writer stops with the clash still in the file.
        return { 'notes.txt': `${run.read('notes.txt')}still working\n` };
      }

      return { 'notes.txt': 'line one\nalpha edit and beta edit\nline three\n' };
    }));
  }, 300_000);

  afterAll(async () => {
    await rig.dispose();
  });

  it('parks with a merge_conflict failure after two resolver runs, and Retry runs one more that merges', async () => {
    const parked = await reachOrReport(rig, 'waiting_human');

    expect(rig.worker.started).toHaveLength(3);
    expect(parked.ticket).toMatchObject({ conflict_count: 2, rework_count: 0 });
    expect(parked.wait_actions).toContain('retry');
    expect(parked.escalations[0]?.payload).toMatchObject({
      cause: 'merge_conflict',
      conflict: { files: ['notes.txt'] },
    });

    const res = await rig.call(
      'POST',
      `/interactions/${parked.escalations[0]?.id ?? 'missing'}/act`,
      { action: 'retry', note: 'Keep both lines.' },
    );

    expect(res, JSON.stringify(res.body)).toMatchObject({ status: 200 });
    await reachOrReport(rig, 'done');

    expect(rig.worker.started).toHaveLength(4);
    const text = git(fixture.remote, 'show', 'main:notes.txt');
    expect(text).toBe(COMBINED);
    expect(MARKERS.test(text)).toBe(false);
  });
});
