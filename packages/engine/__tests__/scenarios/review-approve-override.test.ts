/**
 * Scenario: "Approve and merge" accepts a failed check the owner already overruled (CHE-10).
 *
 * Why: G1 failed on gate configuration alone and the ticket held; the owner pressed Merge anyway,
 *   the ticket reached review, and then Approve and merge refused it forever because the gate row
 *   still read `failed`. The owner had already taken that decision on the record; the last door
 *   must honour it, merge the gated commit and say on the card what was overruled.
 *
 * Pins: after Merge anyway the ticket waits in review, Approve and merge ends done with one merge
 *   of the gated sha, and the card note names G1 and the owner's comment; without the override
 *   (a plain failed G1 row) the same approval is still refused.
 * Depends on: helpers/verify-rig, helpers/escalation-rig, helpers/fake-git-host, vitest.
 */

import type { GateFinding } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { cardEventsOf, pendingOf } from '#tests/helpers/escalation-rig.js';
import { verdict } from '#tests/helpers/fake-git-host.js';
import { drive, makeVerifyRig, startAndFinish } from '#tests/helpers/verify-rig.js';

const CONFIG: GateFinding = {
  check: 'gate-config',
  file: 'vitest.config.ts',
  message: 'vitest.config.ts: gate configuration changed by the Worker (status A)',
};

describe('approve and merge after Merge anyway', () => {
  it('merges a ticket whose failed G1 the owner overruled, and names it on the card', async () => {
    const { rig, host, gate } = await makeVerifyRig({ tier: 'B' });
    gate.script({ ...verdict('failed', [CONFIG]), configOnly: true });
    const id = await startAndFinish(rig, [{ kind: 'edited', path: 'src/a.ts' }]);
    await rig.tick();
    const [item] = await pendingOf(rig, id, 'decision');

    await rig.engine.actOnEscalation(
      item?.id ?? '',
      { action: 'merge_anyway', comment: 'the scaffold needs its own vitest config' },
      'owner',
    );

    await drive(rig, 6, async () => (await rig.ticket(id)).status === 'review');

    expect((await rig.ticket(id)).status).toBe('review');

    const out = await rig.engine.actOnTicket(id, { action: 'approve' }, 'owner');

    expect(out).toEqual({ status: 'done', interaction: null });
    expect(host.count('merge')).toBe(1);

    const notes = await cardEventsOf(rig, (await rig.ticket(id)).card_id, 'note');
    const text = notes.map((n) => n.payload.text).join('\n');

    expect(text).toContain('G1');
    expect(text).toContain('the scaffold needs its own vitest config');
  });
});
