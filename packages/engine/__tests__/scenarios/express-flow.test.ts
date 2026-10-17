/**
 * Scenario: an Express request from chat to a settled, verifying ticket.
 *
 * Why: this is the M0 happy path the whole Director exists for: a chat message becomes a
 *   ticket, the model triages it, a worktree and a run are created under a per-run token,
 *   the Worker's events are stored, and when the run ends the engine records what git says
 *   changed and moves the ticket to Verifying. If any hop in this chain skips its record
 *   (a worktree that is never created, a token that is never revoked, a run row without its
 *   hashes) the later gates and the audit trail have nothing to stand on.
 *
 * Pins: intake dedupe and ticket id allocation; triage then dispatch in one tick with the
 *   right models, branch, worktree and run row; token hash stored then revoked; events and
 *   last_event_at recorded and a tick requested per event; settle records usage, cost,
 *   chain hash and files from the worktree; success moves the ticket to verifying and keeps
 *   the worktree; slots and blockers hold dispatch back; requestTick coalesces.
 * Depends on: helpers/rig, @forge/tools (sha256Hex), vitest.
 */

import { sha256Hex } from '@forge/tools';
import { describe, expect, it } from 'vitest';
import { intake, makeRig } from '#tests/helpers/rig.js';
import { makeResult } from '#tests/helpers/scripted-driver.js';

describe('Express flow', () => {
  it('turns a chat request into a ticket, a worktree, a run and a started Worker', async () => {
    const rig = await makeRig();
    const id = await rig.request('Fix the doctor check');
    expect(id).toBe('FG-1');
    expect((await rig.ticket(id)).status).toBe('inbox');
    expect(rig.tickRequests.count).toBeGreaterThan(0);

    const report = await rig.tick();

    expect(report.triaged).toEqual([
      { ticketId: 'FG-1', lane: 'express', parked: false },
    ]);

    expect(report.dispatched).toEqual([
      { ticketId: 'FG-1', runId: 'run-1', kind: 'new' },
    ]);

    const t = await rig.ticket(id);
    expect(t).toMatchObject({
      status: 'in_progress',
      lane: 'express',
      type: 'fix',
      title: 'Scripted triage title',
      assignee_run_id: 'run-1',
      branch: 'fix/FG-1-scripted-triage-title',
      worktree: '/repo/.worktrees/FG-1',
    });

    expect(rig.worktrees.created).toEqual([
      expect.objectContaining({ ticketId: 'FG-1', baseRef: 'main' }),
    ]);

    const run = await rig.storage.transaction((tx) => tx.runs.get('run-1'));
    expect(run).toMatchObject({
      ticket_id: 'FG-1',
      status: 'running',
      owner: 'srv-a',
      harness: 'scripted',
      cwd: '/repo/.worktrees/FG-1',
      lane: 'express',
      catalogue_hash: 'c'.repeat(64),
    });

    const start = rig.driver.starts[0]!;
    expect(start.prompt.startsWith('Do the ticket.')).toBe(true);
    expect(run?.prompt_hash).toBe(sha256Hex(start.prompt));
    expect(start.promptHash).toBe(sha256Hex(start.prompt));
    expect(start).toMatchObject({
      runId: 'run-1',
      model: 'sonnet',
      cwd: '/repo/.worktrees/FG-1',
      ticketId: 'FG-1',
      projectId: 'forge',
      budget: { maxTurns: 40, maxUsd: 5, stallMs: 300_000, turnMs: 600_000 },
    });

    expect(start.env.FORGE_RUN_TOKEN).toBeDefined();
    const stored = await rig.storage.transaction((tx) => tx.runTokens.getHash('run-1'));
    expect(stored).toBe(sha256Hex(start.env.FORGE_RUN_TOKEN!));
  });

  it('uses the model matrix: opus for Director steps, the budget cap, and the memory slice', async () => {
    const rig = await makeRig();
    await rig.request('Fix it');
    await rig.tick();
    const [triage] = rig.llm.callsTo('triage');
    const [prompt] = rig.llm.callsTo('dispatch_prompt');
    expect(triage!.opts).toEqual({ model: 'opus', budgetUsd: 2 });
    expect(prompt!.opts.model).toBe('opus');
    expect(JSON.stringify(triage!.input)).toContain('d-0001');
    expect(JSON.stringify(prompt!.input)).toContain('r-0001');
    expect(rig.memory.calls).toContain('forge');
  });

  it('stores events, stamps last_event_at, requests a tick per event, and settles to verifying', async () => {
    const rig = await makeRig();
    const id = await rig.request('Fix it');
    await rig.tick();
    const before = rig.tickRequests.count;

    rig.clock.advance(5_000);
    rig.driver.emit('run-1', { type: 'text', text: 'working' });
    await rig.flush();
    const events = await rig.storage.transaction((tx) => tx.runEvents.listByRun('run-1'));
    expect(events.map((e) => e.type)).toEqual(['text']);
    expect(rig.tickRequests.count).toBeGreaterThan(before);
    const mid = await rig.storage.transaction((tx) => tx.runs.get('run-1'));
    expect(mid?.last_event_at).toBe(new Date(rig.clock.now()).toISOString());

    rig.receipts.setChain('run-1', 'a'.repeat(64));
    rig.worktrees.changed = ['src/a.ts', 'src/b.ts'];
    rig.driver.finish(
      'run-1',
      makeResult({
        costUsd: 0.42,
        usage: { in: 100, out: 50, cachedIn: 0, cacheWrite: 0 },
      }),
    );

    await rig.flush();
    const report = await rig.tick();

    expect(report.settled).toEqual([
      expect.objectContaining({
        runId: 'run-1',
        status: 'success',
        filesTouched: ['src/a.ts', 'src/b.ts'],
      }),
    ]);

    const run = await rig.storage.transaction((tx) => tx.runs.get('run-1'));
    expect(run).toMatchObject({
      status: 'success',
      cost_usd: 0.42,
      usage: { in: 100, out: 50 },
      final_chain_hash: 'a'.repeat(64),
      session_ref: 'sess-1',
    });

    expect(run?.ended_at).toBeDefined();
    expect(
      await rig.storage.transaction((tx) => tx.runTokens.getHash('run-1')),
    ).toBeNull();

    expect((await rig.ticket(id)).status).toBe('verifying');
    // The worktree is kept for the PR step (E2); it goes away on Done or Cancelled.
    expect(rig.worktrees.removed).toEqual([]);
    expect(rig.engine.liveRunIds()).toEqual([]);
  });

  it('drops a redelivered intake event and allocates the next number for a new one', async () => {
    const rig = await makeRig();
    const event = intake(
      { payload: { text: 'Fix it', card_type: 'pr_issue' } },
      rig.clock.now(),
    );

    expect((await rig.engine.ingest(event)).status).toBe('ticket_created');
    expect((await rig.engine.ingest(event)).status).toBe('duplicate');
    expect(await rig.request('Another')).toBe('FG-2');
  });

  it('ignores an unknown project and a malformed payload without creating tickets', async () => {
    const rig = await makeRig();
    expect(
      (await rig.engine.ingest(intake({ project: 'nope' }, rig.clock.now()))).status,
    ).toBe('ignored');

    expect(
      (await rig.engine.ingest(intake({ payload: { nothing: 1 } }, rig.clock.now())))
        .status,
    ).toBe('ignored');

    expect(
      await rig.storage.transaction((tx) => tx.tickets.listByStatus('inbox')),
    ).toHaveLength(0);
  });

  it('respects the global slot limit and starts the waiting ticket when a slot frees', async () => {
    const rig = await makeRig({ engine: { max_concurrent_global: 1 } });
    await rig.request('One');
    await rig.request('Two');
    const first = await rig.tick();
    expect(first.dispatched).toHaveLength(1);
    expect((await rig.ticket('FG-2')).status).toBe('planned');

    rig.driver.finish('run-1', makeResult());
    await rig.flush();
    const second = await rig.tick();
    expect(second.dispatched).toEqual([
      { ticketId: 'FG-2', runId: 'run-2', kind: 'new' },
    ]);
  });

  it('respects the per-state limit', async () => {
    const rig = await makeRig({
      engine: { max_concurrent_by_state: { in_progress: 1 }, max_concurrent_global: 5 },
    });

    await rig.request('One');
    await rig.request('Two');
    const report = await rig.tick();
    expect(report.dispatched).toHaveLength(1);
    expect((await rig.ticket('FG-2')).status).toBe('planned');
  });

  it('does not dispatch a ticket whose blocker is not done', async () => {
    const rig = await makeRig();
    await rig.request('Blocked one');
    await rig.request('Blocker');
    // FG-1 depends on FG-2 (still unfinished); FG-2 is free to run.
    await rig.storage.transaction((tx) =>
      tx.ticketRelations.add({
        from_id: 'FG-1' as never,
        to_id: 'FG-2' as never,
        kind: 'depends_on',
      }),
    );

    const report = await rig.tick();
    expect(report.dispatched.map((d) => d.ticketId)).toEqual(['FG-2']);
    expect((await rig.ticket('FG-1')).status).toBe('planned');
  });

  it('coalesces tick requests into one callback, and one more after a running tick', async () => {
    const rig = await makeRig();
    const base = rig.tickRequests.count;
    rig.engine.requestTick();
    rig.engine.requestTick();
    rig.engine.requestTick();
    expect(rig.tickRequests.count - base).toBe(1);
    await rig.tick();
    // The tick consumed the pending request; a new request notifies again.
    rig.engine.requestTick();
    expect(rig.tickRequests.count - base).toBe(2);
  });

  it('is single-flight: overlapping tick calls share one report', async () => {
    const rig = await makeRig();
    await rig.request('One');
    const [a, b] = await Promise.all([rig.tick(), rig.tick()]);
    expect(a).toBe(b);
    expect(rig.llm.callsTo('triage')).toHaveLength(1);
  });
});
