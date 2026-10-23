/**
 * Pins: an ACP `session/prompt` rejected with the adapter's own turn-limit words ends the run as `max_turns`.
 *
 * Why: the eval run that hit its limit came back `error/unknown` and was retried; a turn limit must reach the
 *   engine as `max_turns` with no error family, so the ticket parks once with the limit named.
 * Depends on: helpers/claude-rigs, helpers/fake-acp-agent.
 */

import { RequestError } from '@agentclientprotocol/sdk';
import { describe, expect, it } from 'vitest';
import { makeAcpRig } from '#tests/helpers/claude-rigs.js';

describe('ACP engine: turn-limit rejection', () => {
  it('max_turns: "Reached maximum number of turns (3)" is max_turns, not unknown', async () => {
    const rig = makeAcpRig({});
    rig.next = {
      auth: 'account',
      steering: true,
      onPrompt: async () =>
        RequestError.internalError(undefined, 'Reached maximum number of turns (3)'),
    };

    const result = await rig.driver.result(await rig.driver.start(rig.request()));

    expect(result.status).toBe('max_turns');
    expect(result.errorFamily).toBeUndefined();
  });
});
