/**
 * End to end: a tier B ticket is approved by the owner and merged through the local host.
 *
 * Why: on the live server two tickets passed G1 at tier B and stuck in `review` with only Rework
 *   and Cancel. The owner's "Approve and merge" must work on a project with no GitHub (d-0124):
 *   the real G1 passes, the ticket waits in review (nothing merges by itself), the approval goes
 *   through `POST /tickets/:id/act` and the one merge door, the squash lands on `main` in the
 *   user's own repository and in the clean working tree, and the ticket ends `done`. The ticket
 *   read shows the owner what is about to land (diff stat, gated commit).
 *
 * Pins: tier B stops in review with `approve` offered and the diff stat read from the worktree;
 *   nothing is on main before the approval; after it, main has one new squash commit on top of the
 *   snapshot, the working tree has the change and is clean, and the ticket is done.
 * Depends on: helpers/e2e-rig, helpers/fixture-repo, helpers/scripted-llm.
 *   IO: git, SQLite, npm, a loopback socket.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { intakeBody, startE2eRig } from '#tests/helpers/e2e-rig.js';
import type { E2eRig } from '#tests/helpers/e2e-rig.js';
import {
  createPlainFixture,
  fixtureProjectBody,
  git,
} from '#tests/helpers/fixture-repo.js';
import type { FixtureRepo } from '#tests/helpers/fixture-repo.js';
import { createScriptedDirector } from '#tests/helpers/scripted-llm.js';
import { waitFor } from '#tests/helpers/wait-for.js';

interface TicketView {
  ticket: { id: string; status: string; pr_url?: string };
  wait_actions: string[];
  review: { files: { path: string }[]; additions: number; head_sha?: string } | null;
}

const ticketOf = async (rig: E2eRig): Promise<TicketView> =>
  (await rig.call('GET', '/tickets/FX-1')).body as TicketView;

const reach = (rig: E2eRig, status: string) =>
  waitFor(
    `ticket FX-1 to be ${status}`,
    async () => {
      const found = await ticketOf(rig);

      return found.ticket.status === status ? found : false;
    },
    240_000,
  );

describe(
  'tier B approve and merge on a project with no remote',
  { timeout: 300_000 },
  () => {
    let rig: E2eRig;
    let fixture: FixtureRepo;
    let snapshot = '';

    beforeAll(async () => {
      fixture = createPlainFixture();
      rig = await startE2eRig(['good'], {
        fixture,
        llm: createScriptedDirector({
          triage: {
            lane: 'express',
            confidence: 0.95,
            predicted_files: ['src/math.js', 'test/math.test.js'],
            questions: [],
            type: 'feat',
            tier_predicted: 'B',
            title: 'Add an add function',
          },
        }).llm,
        register: (f) => {
          const body = fixtureProjectBody(f, {
            local_path: f.root,
            git_setup: { mode: 'snapshot' },
          });

          delete body['git_host'];
          delete body['base_branch'];

          return body;
        },
      });

      snapshot = git(fixture.root, 'rev-parse', 'main');
      await rig.call('POST', '/intake', intakeBody('review-1'));
    }, 300_000);

    afterAll(async () => {
      await rig.dispose();
      fixture.dispose();
    });

    it('waits in review offering approve, shows the diff, and merges nothing by itself', async () => {
      const view = await reach(rig, 'review');

      expect(view.wait_actions).toEqual(['approve', 'rework', 'cancel']);
      expect(view.review?.files.map((f) => f.path).sort()).toEqual([
        'src/math.js',
        'test/math.test.js',
      ]);

      expect(view.review?.additions).toBeGreaterThan(0);
      expect(view.review?.head_sha).toBeTruthy();
      expect(git(fixture.root, 'rev-parse', 'main')).toBe(snapshot);
    });

    it('approve merges one squash commit into main and the working tree, and ends done', async () => {
      const res = await rig.call('POST', '/tickets/FX-1/act', { action: 'approve' });
      expect(res.status).toBe(200);

      await reach(rig, 'done');

      expect(git(fixture.root, 'log', '--format=%s', 'main').split('\n')).toHaveLength(2);
      expect(git(fixture.root, 'rev-parse', 'main~1')).toBe(snapshot);
      expect(git(fixture.root, 'show', 'main:src/math.js')).toContain(
        'export function add',
      );

      expect(readFileSync(join(fixture.root, 'src', 'math.js'), 'utf8')).toContain(
        'export function add',
      );

      expect(git(fixture.root, 'status', '--porcelain')).toBe('');
    });
  },
);
