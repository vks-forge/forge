/**
 * Pins: ACP steering and cancel.
 *
 * Why: the Director talks to a running Worker through steer, follow_up and interrupt, and
 * ends it with cancel. Steering uses the adapter's native path only where it is declared,
 * and cancel must reach the whole process tree or the Worker keeps running after the
 * Director thinks it stopped.
 *
 * Depends on: helpers/claude-rigs, helpers/fake-acp-agent, helpers/acp-flow-utils.
 */

import { describe, expect, it } from 'vitest';
import { makeAcpRig } from '#tests/helpers/claude-rigs.js';
import { waitFor } from '#tests/helpers/wait-for.js';
import { promptSeen, events } from '#tests/helpers/acp-flow-utils.js';

describe('ACP engine: steering (rule 6)', () => {
  async function started(steering: boolean) {
    const rig = makeAcpRig();
    rig.scriptHang();
    rig.next = { ...rig.next, steering };
    const h = await rig.driver.start(rig.request());
    await waitFor(promptSeen(rig), 'prompt');

    return { rig, h };
  }

  it('uses _session/steering when the adapter advertises it, and echoes inbox_delivered', async () => {
    const { rig, h } = await started(true);
    await rig.driver.steer(h, 'change course', 'steer', 7);
    expect(rig.agents[0]?.paramsOf('_session/steering')[0]).toMatchObject({
      sessionId: 'sess-1',
      prompt: [{ type: 'text', text: 'change course' }],
      _meta: { steering: { idleBehavior: 'promptRequired' } },
    });

    await rig.driver.cancel(h);
    await rig.driver.result(h);
    expect((await events(rig)).find((e) => e.type === 'inbox_delivered')).toMatchObject({
      inbox_seq: 7,
      mode: 'steer',
    });
  });

  it('refuses steer with a typed error when the adapter does not advertise steering', async () => {
    const { rig, h } = await started(false);
    await expect(rig.driver.steer(h, 'x', 'steer')).rejects.toMatchObject({
      errorFamily: 'invalid_input',
    });

    expect(rig.agents[0]?.methods()).not.toContain('_session/steering');
    await rig.driver.cancel(h);
  });

  it('queues follow_up as the next prompt and runs it after the current turn', async () => {
    const { rig, h } = await started(true);
    await rig.driver.steer(h, 'then do this', 'follow_up');
    expect(rig.agents[0]?.paramsOf('session/prompt')).toHaveLength(1);
    await rig.driver.cancel(h);
    await rig.driver.result(h);
  });

  it('interrupt cancels the turn, then prompts with the message', async () => {
    const { rig, h } = await started(true);
    await rig.driver.steer(h, 'stop and do X', 'interrupt');
    expect((await rig.driver.result(h)).status).toBe('success');
    const m = rig.agents[0]?.methods() ?? [];
    expect(m.indexOf('session/cancel')).toBeLessThan(m.lastIndexOf('session/prompt'));
    expect(rig.agents[0]?.paramsOf('session/prompt')[1]).toMatchObject({
      prompt: [{ type: 'text', text: 'stop and do X' }],
    });
  });

  it('numbers deliveries itself when the sender gave no inbox sequence', async () => {
    const { rig, h } = await started(true);
    await rig.driver.steer(h, 'a', 'follow_up');
    await rig.driver.steer(h, 'b', 'follow_up');
    await rig.driver.cancel(h);
    await rig.driver.result(h);
    const delivered = (await events(rig)).filter((e) => e.type === 'inbox_delivered');
    expect(
      delivered.map((e) => (e.type === 'inbox_delivered' ? e.inbox_seq : -1)),
    ).toEqual([0, 1]);
  });
});

describe('ACP engine: cancel and process tree (rule 7)', () => {
  it('sends session/cancel, then ends the run as cancelled and kills the tree on Windows', async () => {
    const rig = makeAcpRig({}, undefined, 'win32');
    rig.scriptHang();
    const h = await rig.driver.start(rig.request());
    await waitFor(promptSeen(rig), 'prompt');
    await rig.driver.cancel(h);
    expect((await rig.driver.result(h)).status).toBe('cancelled');
    expect(rig.agents[0]?.methods()).toContain('session/cancel');
    const kill = rig.spawns.find((c) => c.command === 'taskkill');
    expect(kill?.args).toEqual(['/T', '/F', '/PID', '4242']);
  });

  it('kills the tree after the grace period when the adapter ignores the cancel', async () => {
    const rig = makeAcpRig({ cancelGraceMs: 2_000 });
    rig.next = {
      auth: 'account',
      onPrompt: async () => new Promise(() => undefined),
    };

    const h = await rig.driver.start(rig.request());
    await waitFor(promptSeen(rig), 'prompt');
    const cancelling = rig.driver.cancel(h);
    await waitFor(() => rig.clock.pending() > 0, 'grace timer');
    await rig.clock.advance(2_000);
    await cancelling;
    expect((await rig.driver.result(h)).status).toBe('cancelled');
    expect(rig.groupSignals).toEqual([{ pid: 4242, signal: 'SIGKILL' }]);
  });

  it('maps a child that dies mid-run to a crash', async () => {
    const rig = makeAcpRig();
    rig.next = { auth: 'account', onPrompt: async () => new Promise(() => undefined) };
    const h = await rig.driver.start(rig.request());
    await waitFor(promptSeen(rig), 'prompt');
    rig.agents[0]?.child.exit(1);
    expect(await rig.driver.result(h)).toMatchObject({
      status: 'error',
      errorFamily: 'crash',
    });
  });
});
