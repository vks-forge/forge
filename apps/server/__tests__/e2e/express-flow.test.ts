/**
 * End to end: an Express ticket goes from `POST /intake` to merged and done.
 *
 * Why: slice 2 exits when a scripted Express ticket runs through the whole system on a
 *   fixture repo: intake, triage, a Worker in a real git worktree, the hook route writing
 *   signed receipts for every tool call, `finish` with typed claims, the real G1 gate, a PR
 *   on the local bare host and the merge. This pins that the pieces, built separately,
 *   work together: the change really lands in the remote's main, G1 judged it from the
 *   receipts, and no tool call went unreceipted. A model is not needed: the Director's
 *   steps and the harness are scripted, everything else is the production assembly.
 *
 * Also pins the event stream on that run: a client connected while the run is live gets
 *   every event in order, and a client reconnecting with `Last-Event-ID: n` gets only the
 *   events after n and then the `end` frame.
 *
 * Pins: ticket reaches `done`; the run row names its settings version and the settings API
 *   serves the project registered through POST /projects; the change is in the bare repo's main; G1 passed; every
 *   tool call has a decision receipt and the chain verifies; the run secret is deleted once the
 *   ticket is done (d-0100); hook liveness was registered;
 *   SSE live delivery and resume from a cursor.
 * Depends on: helpers/e2e-rig. IO: git, SQLite, npm, a loopback socket.
 */

import { verifyChain } from '@forge/tools';
import type { DecisionReceipt } from '@forge/tools';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { git } from '#tests/helpers/fixture-repo.js';
import { intakeBody, startE2eRig } from '#tests/helpers/e2e-rig.js';
import type { E2eRig } from '#tests/helpers/e2e-rig.js';
import { readSse } from '#tests/helpers/sse-client.js';
import type { SseFrame } from '#tests/helpers/sse-client.js';
import { waitFor } from '#tests/helpers/wait-for.js';

interface TicketView {
  ticket: { id: string; status: string; blocked_reason?: string };
  runs: {
    id: string;
    status: string;
    hook_registered_at?: string;
    config_version?: string;
  }[];
  gate_results: { gate: string; status: string; head_sha?: string }[];
  interactions: unknown[];
}

// Real git worktrees, a real G1 (`npm test` and lint) and the engine's tick chain make this
// slower than a unit test; the limits allow for the full suite running in parallel.
describe('express flow end to end', { timeout: 300_000 }, () => {
  let rig: E2eRig;
  let view: TicketView;
  let intakeStatus = 0;
  let live: Promise<{ frames: SseFrame[] }>;

  beforeAll(async () => {
    rig = await startE2eRig(['good']);
    const intake = await rig.call('POST', '/intake', intakeBody('flow-1'));
    intakeStatus = intake.status;
    // Connect while the run is live: part of the stream is replay, part is delivered as it happens.
    const runId = await waitFor('the first run to start', () => rig.worker.started[0]);
    live = readSse(`${rig.address.url}/runs/${runId}/events`, {
      headers: rig.authHeaders,
    });

    try {
      view = await waitFor(
        'ticket FX-1 to be done',
        async () => {
          const res = await rig.call('GET', '/tickets/FX-1');
          const found = res.body as TicketView;

          return found.ticket.status === 'done' ? found : false;
        },
        280_000,
      );
    } catch (error) {
      const now = await rig.call('GET', '/tickets/FX-1');

      const report = [
        String(error),
        JSON.stringify(now.body),
        ...rig.logs,
        ...rig.worker.failures,
      ];

      throw new Error(report.join(String.fromCharCode(10)));
    }
  }, 300_000);

  afterAll(async () => {
    await rig.dispose();
  });

  it('accepts the intake with 202', () => {
    expect(intakeStatus).toBe(202);
  });

  it('merges the change into the remote main', () => {
    const math = git(rig.fixture.remote, 'show', 'main:src/math.js');
    const spec = git(rig.fixture.remote, 'show', 'main:test/math.test.js');

    expect(math).toContain('export function add(a, b)');
    expect(spec).toContain('adds two numbers');
  });

  it('names the settings version the run started under: built-in company, registered project', () => {
    expect(view.runs[0]?.config_version).toBe('c0:p1');
  });

  it('serves the registered project settings and their history through the settings API', async () => {
    const got = await rig.call('GET', '/settings/projects/fixture');
    const history = await rig.call('GET', '/settings/projects/fixture/history');

    expect(got.body).toMatchObject({
      version: { company: 0, project: 1 },
      config: {
        project: {
          checks: [
            { name: 'lint', role: 'lint', command: 'node scripts/lint.mjs' },
            { name: 'test', role: 'test', command: 'npm test' },
          ],
        },
      },
    });

    expect(history.body).toMatchObject({
      versions: [{ version: 1, author: 'tester' }],
    });
  });

  it('records a passed G1 verdict on the judged commit', () => {
    const g1 = view.gate_results.filter((g) => g.gate === 'G1');

    expect(g1).toHaveLength(1);
    expect(g1[0]?.status).toBe('passed');
    expect(g1[0]?.head_sha).toBeTruthy();
    expect(rig.worker.failures).toEqual([]);
  });

  it('gives every tool call a decision receipt on a chain that verifies', async () => {
    const run = view.runs[0];
    const events = await rig.server.storage.transaction((tx) =>
      tx.runEvents.listByRun(run?.id ?? ''),
    );

    const calls = events.flatMap((e) => (e.type === 'tool_call' ? [e] : []));
    const receipts = await rig.server.receipts.list(run?.id ?? '');
    const decided = new Set(
      receipts
        .filter((r): r is DecisionReceipt => r.kind === 'decision')
        .map((r) => r.id),
    );

    const secret = rig.secrets.secretOf(run?.id ?? '', 1);

    expect(calls.map((c) => c.name)).toEqual([
      'Read',
      'Write',
      'Write',
      'Bash',
      'mcp__forge__finish',
    ]);

    expect(calls.every((c) => decided.has(c.call_id))).toBe(true);
    expect(secret).not.toBeNull();
    expect(verifyChain(receipts, secret ?? '').ok).toBe(true);
  });

  it('deletes the run secret once the ticket has left the gates', async () => {
    const remaining = await waitFor(
      'the run secrets to be retired',
      async () => ((await rig.secrets.list('run/')).length === 0 ? true : false),
      30_000,
    );

    expect(remaining).toBe(true);
    expect(await rig.server.runSecrets.secret(view.runs[0]?.id ?? '', 1)).toBeNull();
  });

  it('registered hook liveness before the first tool call', async () => {
    const run = view.runs[0];
    const events = await rig.server.storage.transaction((tx) =>
      tx.runEvents.listByRun(run?.id ?? ''),
    );

    const liveness = events.findIndex((e) => e.type === 'hook_liveness');
    const firstCall = events.findIndex((e) => e.type === 'tool_call');

    expect(run?.hook_registered_at).toBeTruthy();
    expect(liveness).toBeGreaterThanOrEqual(0);
    expect(liveness).toBeLessThan(firstCall);
  });

  it('streams every event of a live run in order, then ends', async () => {
    const { frames } = await live;
    const stored = await rig.server.storage.transaction((tx) =>
      tx.runEvents.listByRun(view.runs[0]?.id ?? ''),
    );

    const ids = frames.flatMap((f) => (f.id === undefined ? [] : [Number(f.id)]));

    expect(ids).toEqual(stored.map((e) => e.seq));
    expect(frames.at(-1)?.event).toBe('end');
    expect(frames.find((f) => f.event === 'finish')?.data).toContain('Added add()');
  });

  it('resumes after Last-Event-ID and sends only later events', async () => {
    const runId = view.runs[0]?.id ?? '';
    const stored = await rig.server.storage.transaction((tx) =>
      tx.runEvents.listByRun(runId),
    );

    const cursor = stored[2]?.seq ?? 0;

    const res = await readSse(`${rig.address.url}/runs/${runId}/events`, {
      lastEventId: String(cursor),
      headers: rig.authHeaders,
    });

    const ids = res.frames.flatMap((f) => (f.id === undefined ? [] : [Number(f.id)]));

    expect(res.status).toBe(200);
    expect(res.contentType).toContain('text/event-stream');
    expect(ids).toEqual(stored.filter((e) => e.seq > cursor).map((e) => e.seq));
    expect(res.frames.at(-1)?.event).toBe('end');
  });

  it('rejects a malformed cursor and an unknown run', async () => {
    const runId = view.runs[0]?.id ?? '';
    const bad = await readSse(`${rig.address.url}/runs/${runId}/events?after=abc`, {
      headers: rig.authHeaders,
    });

    const missing = await readSse(`${rig.address.url}/runs/run-nope/events`, {
      headers: rig.authHeaders,
    });

    expect(bad.status).toBe(400);
    expect(missing.status).toBe(404);
  });

  it('answers /health with the live state', async () => {
    const res = await rig.call('GET', '/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ service: 'forge', status: 'ok' });
  });
});
