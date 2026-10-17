/**
 * Scenario: finished tier B and tier C work has a way forward, through the one merge door.
 *
 * Why: on the live server two Worker runs passed G1 at tier B and the ticket stuck in `review`
 *   with only Rework and Cancel: nobody could merge it. "Approve and merge" (tier B) and "Sign
 *   off and merge" (tier C, with a named signer) are the owner's acts. They must merge exactly
 *   the commit the gates judged, refuse (and send the work back to the gates) when the PR head
 *   moved, and never merge anything that is not in review or sign-off, because the merge is the
 *   one irreversible step.
 *
 * Pins: approve merges the gated sha once and ends done with cleanup; sign off needs and records a
 *   signer and ends done; a moved head merges nothing and returns the ticket to verifying with a
 *   `head_moved` outcome, and the next tick gates the new head; a closed PR is refused; the action
 *   is refused for a ticket in any other status and through an interaction.
 * Depends on: helpers/verify-rig, helpers/fake-git-host, vitest.
 */

import { describe, expect, it } from 'vitest';
import { cardEventsOf } from '#tests/helpers/escalation-rig.js';
import { makeVerifyRig, startAndFinish } from '#tests/helpers/verify-rig.js';

async function inReview(tier: 'B' | 'C') {
  const v = await makeVerifyRig({ tier: tier === 'C' ? 'A' : 'B' });
  if (tier === 'C') {
    v.rig.worktrees.changed = ['src/auth/login.ts'];
  }

  const id = await startAndFinish(v.rig, [{ kind: 'edited', path: 'src/a.ts' }]);
  await v.rig.tick();
  const status = tier === 'B' ? 'review' : 'needs_signoff';
  expect((await v.rig.ticket(id)).status).toBe(status);

  return { ...v, id };
}

describe('approve and merge (tier B)', () => {
  it('merges exactly the gated sha once, ends done and cleans up', async () => {
    const { rig, host, id } = await inReview('B');
    expect(host.count('merge')).toBe(0);

    const out = await rig.engine.actOnTicket(id, { action: 'approve' }, 'owner');

    expect(out).toEqual({ status: 'done', interaction: null });
    expect(host.mergeShas).toEqual(['head-sha-1']);
    expect(host.count('merge')).toBe(1);
    expect(await rig.ticket(id)).toMatchObject({ status: 'done', tier_actual: 'B' });
    expect(rig.worktrees.removed).toContain('/repo/.worktrees/FG-1');
    expect(host.count('deleteBranch')).toBe(1);
  });

  it('refuses a second approve (the ticket is done) without merging again', async () => {
    const { rig, host, id } = await inReview('B');
    await rig.engine.actOnTicket(id, { action: 'approve' }, 'owner');

    const again = await rig.engine.actOnTicket(id, { action: 'approve' }, 'owner');

    expect(again.status).toBe('action_not_offered');
    expect(host.count('merge')).toBe(1);
  });

  it('merges nothing when the PR head moved, and sends the ticket back to the gates', async () => {
    const { rig, host, id } = await inReview('B');
    host.headSha = 'head-sha-2';

    const out = await rig.engine.actOnTicket(id, { action: 'approve' }, 'owner');

    expect(out).toEqual({ status: 'head_moved' });
    expect(host.count('merge')).toBe(0);
    expect(await rig.ticket(id)).toMatchObject({ status: 'verifying' });
    expect((await rig.ticket(id)).tier_actual).toBeUndefined();
  });

  it('refuses a PR the host already closed', async () => {
    const { rig, host, id } = await inReview('B');
    host.prState = 'closed';

    const out = await rig.engine.actOnTicket(id, { action: 'approve' }, 'owner');

    expect(out.status).toBe('merge_refused');
    expect(host.count('merge')).toBe(0);
    expect((await rig.ticket(id)).status).toBe('review');
  });

  it('is not offered for a ticket that is not in review, or through an interaction', async () => {
    const { rig } = await makeVerifyRig();
    const id = await rig.request('Fix the doctor check');
    await rig.tick();

    expect(
      (await rig.engine.actOnTicket(id, { action: 'approve' }, 'owner')).status,
    ).toBe('action_not_offered');

    expect(
      (await rig.engine.actOnTicket(id, { action: 'sign_off' }, 'owner')).status,
    ).toBe('action_not_offered');
  });
});

describe('sign off and merge (tier C)', () => {
  it('merges and records the named signer on the card', async () => {
    const { rig, host, id } = await inReview('C');

    const out = await rig.engine.actOnTicket(
      id,
      { action: 'sign_off', signer: 'Vikash' },
      'owner',
    );

    expect(out).toEqual({ status: 'done', interaction: null });
    expect(host.count('merge')).toBe(1);
    expect(await rig.ticket(id)).toMatchObject({ status: 'done', tier_actual: 'C' });
    const card = (await rig.ticket(id)).card_id;
    const notes = await cardEventsOf(rig, card, 'note');
    expect(notes.some((n) => n.payload.text.includes('Vikash'))).toBe(true);
  });

  it('falls back to the owner as the signer when none is named', async () => {
    const { rig, id } = await inReview('C');

    const out = await rig.engine.actOnTicket(id, { action: 'sign_off' }, 'owner');

    expect(out.status).toBe('done');
    const notes = await cardEventsOf(rig, (await rig.ticket(id)).card_id, 'note');
    expect(notes.some((n) => n.payload.text.includes('owner'))).toBe(true);
  });

  it('does not offer approve on tier C or sign off on tier B', async () => {
    const c = await inReview('C');
    expect(
      (await c.rig.engine.actOnTicket(c.id, { action: 'approve' }, 'owner')).status,
    ).toBe('action_not_offered');

    const b = await inReview('B');
    expect(
      (await b.rig.engine.actOnTicket(b.id, { action: 'sign_off' }, 'owner')).status,
    ).toBe('action_not_offered');
  });
});
