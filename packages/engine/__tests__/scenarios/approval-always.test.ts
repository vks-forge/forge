/**
 * Scenario: "Always for this project" stores a narrow rule as a settings version, then settles.
 *
 * Why: the owner should not be asked about the same safe command on every ticket, but a rule that
 *   widens what Workers may do is a change to the project's policy. It is stored the way every
 *   setting is, as a numbered, attributed version the owner can read and revoke (d-0085, d-0090),
 *   before the item settles, so no click can leave the owner thinking a rule exists when it does
 *   not. Two editors saving at once must not lose either save.
 *
 * Pins: allow always appends one project settings version holding the rule with its source and a
 *   reason naming the ticket, then settles with `settings_version`; the same approval is never
 *   stored twice; a save that loses the race is retried; three lost races settle nothing; an item
 *   that offers no rule refuses `allow_always`; the rule carries exactly what the owner was shown.
 * Depends on: helpers/approval-rig, helpers/rig, @forge/core, vitest.
 */

import { ConfigVersionConflictError } from '@forge/core';
import { describe, expect, it, vi } from 'vitest';
import {
  answer,
  idOf,
  permissionsOf,
  raise,
  settleRun1,
  standardTicket,
} from '#tests/helpers/approval-rig.js';
import { makeRig } from '#tests/helpers/rig.js';

const CMD = 'pkg add left-pad';

async function approvedRules(rig: Awaited<ReturnType<typeof makeRig>>) {
  const last = (await rig.config.history('project', 'forge')).at(-1);

  return {
    version: last?.version,
    author: last?.author,
    reason: last?.reason,
    rules: last?.scope === 'project' ? (last.doc.tool_grants?.approved ?? []) : [],
  };
}

describe('allow always', () => {
  it('appends a project settings version with the rule, then settles with its version', async () => {
    const rig = await makeRig();
    const id = await standardTicket(rig);
    const item = idOf(await raise(rig, CMD));
    await settleRun1(rig);

    const done = await answer(rig, item, 'allow_always');

    expect(done.status).toBe('done');
    const stored = await approvedRules(rig);
    expect(stored.version).toBe(1);
    expect(stored.author).toBe('owner');
    expect(stored.reason).toBe(`Always allowed from ${id} (${item})`);
    expect(stored.rules).toEqual([
      expect.objectContaining({
        action: 'shell',
        resource: CMD,
        effect: 'allow',
        source: { ticket_id: id, interaction_id: item },
      }),
    ]);

    const [row] = await permissionsOf(rig, id);
    expect(row?.answer).toMatchObject({
      action: 'allow_always',
      by: 'owner',
      settings_version: 1,
    });

    expect((await rig.tick()).dispatched).toEqual([
      { ticketId: id, runId: 'run-2', kind: 'resume' },
    ]);
  });

  it('keeps earlier approved rules when it adds another', async () => {
    const rig = await makeRig();
    await standardTicket(rig);
    const first = idOf(await raise(rig, 'pkg add a'));
    const second = idOf(await raise(rig, 'pkg add b'));

    await answer(rig, first, 'allow_always');
    await answer(rig, second, 'allow_always');

    const stored = await approvedRules(rig);
    expect(stored.version).toBe(2);
    expect(stored.rules.map((r) => r.resource)).toEqual(['pkg add a', 'pkg add b']);
  });

  it('retries a save that lost the race and loses neither save', async () => {
    const rig = await makeRig();
    await standardTicket(rig);
    const item = idOf(await raise(rig, CMD));
    const real = rig.config.append.bind(rig.config);
    let lost = 0;
    const spy = vi.spyOn(rig.config, 'append').mockImplementation(async (input) => {
      if (lost === 0) {
        lost += 1;
        // Another editor saves first.
        await real({
          scope: 'project',
          project: 'forge',
          doc: { max_concurrent: 1 },
          author: 'someone',
          reason: 'someone else',
          expectedVersion: input.expectedVersion,
        });

        throw new ConfigVersionConflictError(
          input.expectedVersion,
          input.expectedVersion + 1,
        );
      }

      return real(input);
    });

    const done = await answer(rig, item, 'allow_always');
    spy.mockRestore();

    expect(done.status).toBe('done');
    const stored = await approvedRules(rig);
    expect(stored.version).toBe(2);
    expect(stored.rules).toHaveLength(1);
  });

  it('settles nothing when every save loses the race', async () => {
    const rig = await makeRig();
    const id = await standardTicket(rig);
    const item = idOf(await raise(rig, CMD));
    const spy = vi.spyOn(rig.config, 'append').mockImplementation(async (input) => {
      throw new ConfigVersionConflictError(
        input.expectedVersion,
        input.expectedVersion + 1,
      );
    });

    const done = await answer(rig, item, 'allow_always');
    spy.mockRestore();

    expect(done).toEqual({ status: 'stale' });
    expect((await permissionsOf(rig, id))[0]?.status).toBe('pending');
    expect((await approvedRules(rig)).rules).toEqual([]);
  });

  it('refuses allow_always when no rule is offered, and still lets the owner allow once', async () => {
    const rig = await makeRig();
    const id = await standardTicket(rig);
    const item = idOf(
      await raise(rig, 'pkg add a && pkg add b', {
        always: { offered: false, why: 'A chain of commands is approved each time.' },
      }),
    );

    expect(await answer(rig, item, 'allow_always')).toEqual({
      status: 'action_not_offered',
    });

    expect((await approvedRules(rig)).rules).toEqual([]);
    expect((await answer(rig, item, 'allow_once')).status).toBe('done');
    expect((await permissionsOf(rig, id))[0]?.answer).toMatchObject({
      action: 'allow_once',
    });
  });
});
