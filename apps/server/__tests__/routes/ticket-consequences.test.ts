/**
 * `GET /tickets/:id/consequences`: what Re-plan, Cancel ticket and Merge anyway would change.
 *
 * Why: the owner confirms these three actions in a popup that must list the real effect. A Re-plan
 *   list that called a ticket with a run "not started", or hid the tickets that are held until the
 *   new plan is approved, would make the owner decide on a false picture; a Cancel list that missed
 *   the open pull request or the tickets waiting on this one would hide what is lost; a Merge
 *   anyway list that did not name the overruled check would make the override anonymous.
 *
 * Pins: Re-plan splits the card's tickets into held (not started, no open item) and kept (a run,
 *   an open item, or done), counts the stopped ticket as replaced, carries the stop and flags a
 *   mechanical one; Cancel reports the live run, branch, worktree, pull request and dependents;
 *   Merge anyway names the overruled stage with its counts and top findings; bad ids, a bad action
 *   and an unknown ticket are refused.
 * Depends on: helpers/card-rig, vitest. IO: a loopback socket.
 */

import type { Interaction, Run } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { at, card, question, startCardRig, ticket } from '#tests/helpers/card-rig.js';
import type { CardRig } from '#tests/helpers/card-rig.js';

let ctx: CardRig;

const get = (id: string, action: string) =>
  ctx.rig.json('GET', `/tickets/${id}/consequences?action=${action}`);

const run = (id: string, ticketId: string, over: Partial<Run> = {}): Run => ({
  id,
  ticket_id: ticketId,
  harness: 'claude',
  driver_version: '1',
  cwd: '/w',
  lane: 'express',
  started_at: at(1),
  status: 'success',
  owner: 'srv-test',
  ...over,
});

const hold = (issue: string): Interaction => ({
  id: 'int-hold',
  ticket_id: 'FX-1',
  card_id: 'FX-C1' as Interaction['card_id'],
  kind: 'decision',
  payload: {
    kind: 'decision',
    cause: 'findings_hold',
    summary: 'Critique found problems',
    stage_id: 'critique',
    stage_label: 'Critique',
    findings: [
      {
        severity: 'high',
        file: 'pnpm-lock.yaml',
        line: 3,
        issue,
        evidence: 'the lockfile is out of step with package.json',
      },
    ],
    rework: { count: 1, cap: 2 },
  },
  status: 'pending',
  asked_at: at(3),
  escalated_at: at(3),
  timeout_at: '9999-12-31T23:59:59.999Z',
});

beforeEach(async () => {
  ctx = await startCardRig();
  await ctx.seed(
    [card(1, { phase: 'in_progress' }), card(2)],
    [
      ticket(1, 1, {
        title: 'Stopped one',
        status: 'waiting_human',
        branch: 'forge/FX-1',
        worktree: '/w/FX-1',
        pr_number: 7,
        assignee_run_id: 'r1',
      }),
      ticket(2, 1, { title: 'Not started', status: 'planned' }),
      ticket(3, 1, { title: 'Running', status: 'in_progress' }),
      ticket(4, 1, { title: 'Finished', status: 'done' }),
      ticket(5, 1, { title: 'Asking', status: 'waiting_human' }),
      ticket(6, 1, { title: 'Gone', status: 'cancelled' }),
      ticket(7, 2, { title: 'Other card', status: 'planned' }),
      ticket(8, 1, {
        title: 'Waits on one',
        status: 'blocked',
        blocked_by: ['FX-1' as never],
      }),
    ],
  );

  await ctx.storage.transaction(async (tx) => {
    await tx.runs.insert(run('r1', 'FX-1', { status: 'running' }));
    await tx.runs.insert(run('r3', 'FX-3'));
    await tx.runs.insert(run('r4', 'FX-4'));
    await tx.interactions.insert(hold('lockfile changed by hand'));
    await tx.interactions.insert({ ...question('FX-5'), id: 'int-ask' });
  });
});

afterEach(async () => {
  await ctx.rig.close();
});

describe('GET /tickets/:id/consequences?action=replan', () => {
  it('holds the tickets that have not started and keeps those with a run, an open item or a finish', async () => {
    const res = await get('FX-1', 'replan');
    const body = res.body as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body['ticket_replaced']).toBe(true);
    expect(body['held']).toEqual([
      { id: 'FX-2', title: 'Not started' },
      { id: 'FX-8', title: 'Waits on one' },
    ]);

    const kept = (body['kept'] as { id: string; status: string }[]).map(
      (t) => `${t.id}:${t.status}`,
    );

    expect(kept.sort()).toEqual(['FX-3:in_progress', 'FX-4:done', 'FX-5:waiting_human']);
  });

  it('carries the stop and marks a lockfile problem as mechanical', async () => {
    const body = (await get('FX-1', 'replan')).body as Record<string, unknown>;

    expect(body['stop']).toEqual({
      cause: 'findings_hold',
      summary: 'Critique found problems',
      findings: 1,
    });

    expect(body['mechanical']).toEqual({ kind: 'lockfile' });
  });

  it('does not call a real finding mechanical', async () => {
    await ctx.storage.transaction(async (tx) => {
      await tx.interactions.answer('int-hold', { action: 'cancel', by: 'owner' }, at(4));
      await tx.interactions.insert({
        ...hold('the window is computed in the wrong time zone'),
        id: 'int-real',
        payload: {
          ...(hold('x').payload as object),
          findings: [
            {
              severity: 'high',
              file: 'src/window.ts',
              issue: 'the window is computed in the wrong time zone',
              evidence: 'new Date(start) is read without a zone',
            },
          ],
        },
      });
    });

    const body = (await get('FX-1', 'replan')).body as Record<string, unknown>;

    expect(body['mechanical']).toBeNull();
  });
});

describe('GET /tickets/:id/consequences?action=cancel', () => {
  it('reports the live run, branch, worktree, pull request and the tickets waiting on it', async () => {
    const res = await get('FX-1', 'cancel');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      action: 'cancel',
      ticket: { id: 'FX-1', title: 'Stopped one' },
      run_active: true,
      branch: 'forge/FX-1',
      has_worktree: true,
      pr_number: 7,
      dependents: [{ id: 'FX-8', title: 'Waits on one' }],
    });
  });

  it('says nothing is stopped or deleted for a ticket with no run, branch or pull request', async () => {
    const body = (await get('FX-2', 'cancel')).body as Record<string, unknown>;

    expect(body).toMatchObject({
      run_active: false,
      branch: null,
      has_worktree: false,
      pr_number: null,
      dependents: [],
    });
  });
});

describe('GET /tickets/:id/consequences?action=merge_anyway', () => {
  it('names the overruled check with its counts and findings, and the branch and pull request', async () => {
    const res = await get('FX-1', 'merge_anyway');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      action: 'merge_anyway',
      ticket: { id: 'FX-1', title: 'Stopped one' },
      overruled: [
        {
          stage_label: 'Critique',
          summary: 'Critique found problems',
          counts: { high: 1 },
          findings: [
            {
              severity: 'high',
              where: 'pnpm-lock.yaml:3',
              issue: 'lockfile changed by hand',
            },
          ],
        },
      ],
      branch: 'forge/FX-1',
      pr_number: 7,
    });
  });
});

describe('refusals', () => {
  it('answers 400 for a bad ticket id or action and 404 for an unknown ticket', async () => {
    const error = (res: { body: unknown }) =>
      (res.body as { error: { code: string } }).error.code;

    expect(error(await get('nope', 'replan'))).toBe('invalid_ticket_id');
    expect(error(await get('FX-1', 'retry'))).toBe('invalid_action');
    expect((await get('FX-99', 'replan')).status).toBe(404);
  });
});
