/**
 * End to end: a run survives a server restart and its ticket still merges with a passed G1.
 *
 * Why: stopping Forge must not cost a Worker its work (d-0092). This pins the whole path with
 *   the production assembly and a scripted harness: the first server starts an Express ticket,
 *   the Worker edits one file and is still working when the server is stopped (graceful, like
 *   `forge stop` or Ctrl-C); the run is left `interrupted` with its session, the worktree and
 *   its run secret; a second server on the same data home resumes the SAME run under a new
 *   generation, token and secret (d-0100), the Worker hooks in again and finishes, and G1
 *   verifies the receipt chain across both generations, each with its own secret, before the
 *   change is merged. If any link broke (the interrupt, the stored session, the secret
 *   surviving the restart, the `resumed` link, the per-generation verification) the ticket
 *   would crash, fail G1, or merge on an unverifiable chain.
 *
 * Pins: the stopped run is `interrupted` with its session and its secret is still stored; the
 *   second server resumes the same run id with `resume` and generation 2; one run row, generation
 *   2, success; the chain has one `resumed` link and verifies with the two recorded secrets;
 *   the G1 report says it verified two generations; liveness registered again; the old token is
 *   refused; the secrets are deleted once the ticket is done; the change is in the remote main.
 * Depends on: helpers/e2e-rig, helpers/recording-secrets, @forge/db, @forge/tools.
 *   IO: git, SQLite, npm, loopback sockets.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openSqlite } from '@forge/db';
import { verifyGenerations } from '@forge/tools';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { intakeBody, startE2eRig } from '#tests/helpers/e2e-rig.js';
import type { E2eRig } from '#tests/helpers/e2e-rig.js';
import { git } from '#tests/helpers/fixture-repo.js';
import { waitFor } from '#tests/helpers/wait-for.js';

interface TicketView {
  ticket: { id: string; status: string };
  runs: { id: string; status: string; generation?: number }[];
  gate_results: { gate: string; status: string; report_ref?: string }[];
}

describe('resume across a restart end to end', { timeout: 300_000 }, () => {
  let first: E2eRig;
  let second: E2eRig;
  let runId = '';
  let view: TicketView;
  let stopped: {
    run: { status: string; generation?: number; resumable_session?: string };
    ticket: string;
    secrets: string[];
  };

  beforeAll(async () => {
    first = await startE2eRig(['resumable']);
    const intake = await first.call('POST', '/intake', intakeBody('resume-1'));
    expect(intake.status).toBe(202);

    runId = await waitFor('the first run to start', () => first.worker.started[0]);
    // The Worker has made its first two tool calls (Read, Write) and is now waiting.
    await waitFor('two tool calls', async () => {
      const events = await first.server.storage.transaction((tx) =>
        tx.runEvents.listByRun(runId),
      );

      return events.filter((e) => e.type === 'tool_call').length >= 2;
    });

    // The first server stops gracefully, the way `forge stop` does.
    await first.server.stop();
    const db = openSqlite(first.settings.layout.data.dbPath);
    try {
      const [run, ticket] = await db.storage.transaction(async (tx) => [
        await tx.runs.get(runId),
        await tx.tickets.get('FX-1' as never),
      ]);

      stopped = {
        run: {
          status: run?.status ?? 'missing',
          ...(run?.generation === undefined ? {} : { generation: run.generation }),
          ...(run?.resumable_session === undefined
            ? {}
            : { resumable_session: run.resumable_session }),
        },
        ticket: ticket?.status ?? 'missing',
        secrets: await first.secrets.list('run/'),
      };
    } finally {
      await db.storage.close();
    }

    // A second server on the same data home and the same secret store.
    second = await startE2eRig(['resumable'], {
      fixture: first.fixture,
      secrets: first.secrets,
    });

    try {
      view = await waitFor(
        'ticket FX-1 to be done',
        async () => {
          const res = await second.call('GET', '/tickets/FX-1');
          const found = res.body as TicketView;

          return found.ticket.status === 'done' ? found : false;
        },
        280_000,
      );
    } catch (error) {
      const now = await second.call('GET', '/tickets/FX-1');

      throw new Error(
        [
          String(error),
          JSON.stringify(now.body),
          ...first.logs,
          ...second.logs,
          ...second.worker.failures,
        ].join(String.fromCharCode(10)),
      );
    }
  }, 300_000);

  afterAll(async () => {
    await second?.dispose();
    await first?.dispose();
  });

  it('left the run interrupted with its session, its ticket in progress and its secret stored', () => {
    expect(stopped.run).toEqual({
      status: 'interrupted',
      generation: 1,
      resumable_session: `sess-${runId}`,
    });

    expect(stopped.ticket).toBe('in_progress');
    expect(stopped.secrets).toEqual([`run/${runId}/secret-g1`]);
  });

  it('resumed the same run from its session under generation 2', () => {
    expect(second.worker.started).toEqual([runId]);
    expect(second.worker.requests[0]).toMatchObject({
      runId,
      resume: `sess-${runId}`,
      generation: 2,
    });

    expect(view.runs).toHaveLength(1);
    expect(view.runs[0]).toMatchObject({ id: runId, status: 'success', generation: 2 });
    expect(second.worker.failures).toEqual([]);
  });

  it('gave the resumed process a new token', () => {
    const before = first.worker.requests[0]?.env['FORGE_RUN_TOKEN'];
    const after = second.worker.requests[0]?.env['FORGE_RUN_TOKEN'];

    expect(before).toBeTruthy();
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
  });

  it('merged the change after a passed G1 that verified both generations', () => {
    const g1 = view.gate_results.filter((g) => g.gate === 'G1');

    expect(g1).toHaveLength(1);
    expect(g1[0]?.status).toBe('passed');
    expect(git(second.fixture.remote, 'show', 'main:src/math.js')).toContain(
      'export function add(a, b)',
    );

    const report = readFileSync(
      join(second.settings.layout.data.home, g1[0]?.report_ref ?? ''),
      'utf8',
    );

    expect(report).toContain('across 2 generation(s)');
  });

  it('wrote one resumed link and a chain that verifies with each generation secret', async () => {
    const receipts = await second.server.receipts.list(runId);
    const kinds = receipts.map((r) => r.kind);

    expect(kinds.filter((k) => k === 'resumed')).toHaveLength(1);
    expect(kinds.indexOf('resumed')).toBe(
      receipts.findIndex((r) => r.kind === 'resumed'),
    );

    const g1 = first.secrets.secretOf(runId, 1);
    const g2 = first.secrets.secretOf(runId, 2);
    expect(g1).toBeTruthy();
    expect(g2).toBeTruthy();
    expect(g1).not.toBe(g2);
    expect(
      verifyGenerations(receipts, (g) => first.secrets.secretOf(runId, g)),
    ).toMatchObject({ ok: true, value: { generations: 2 } });

    // The first generation's receipts come before the link, the second's after it.
    const link = kinds.indexOf('resumed');
    expect(link).toBeGreaterThan(0);
    expect(link).toBeLessThan(kinds.length - 1);
  });

  it('registered hook liveness again for the resumed process, before its first tool call', async () => {
    const events = await second.server.storage.transaction((tx) =>
      tx.runEvents.listByRun(runId),
    );

    const types = events.map((e) => e.type);
    const second_liveness = types.lastIndexOf('hook_liveness');
    const lastCall = types.lastIndexOf('tool_call');

    expect(types.filter((t) => t === 'hook_liveness')).toHaveLength(2);
    expect(second_liveness).toBeGreaterThan(types.indexOf('tool_call'));
    expect(second_liveness).toBeLessThan(lastCall);
  });

  it('refuses the old generation token', async () => {
    const old = first.worker.requests[0]?.env['FORGE_RUN_TOKEN'] ?? '';
    const res = await fetch(`${second.address.url}/runs/${runId}/hook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${old}` },
      body: JSON.stringify({
        event: 'PreToolUse',
        payload: {
          hook_event_name: 'PreToolUse',
          tool_name: 'Read',
          tool_input: { file_path: 'x' },
          tool_use_id: 'late',
        },
        seq: 1,
      }),
    });

    expect(((await res.json()) as { decision: string }).decision).toBe('deny');
  });

  it('deleted the run secrets once the ticket had left the gates', async () => {
    const left = await waitFor(
      'the run secrets to be retired',
      async () => (await first.secrets.list('run/')).length === 0,
      30_000,
    );

    expect(left).toBe(true);
    expect(await second.server.runSecrets.secret(runId, 1)).toBeNull();
    expect(await second.server.runSecrets.secret(runId, 2)).toBeNull();
  });
});
