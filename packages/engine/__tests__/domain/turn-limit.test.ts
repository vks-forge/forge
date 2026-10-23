/**
 * Pins: which turn limit a run was held to and where the owner raises it.
 *
 * Why: a Worker that used all its turns is only fixable by raising the limit that applied to it. That is the agent's
 *   own turn limit when it sets one, else the Forge-wide "Turns per run"; naming the wrong one sends the owner to
 *   a setting that changes nothing. The rule must be the one the run request used, or the message lies.
 *
 * Depends on: src/domain/turn-limit.
 */

import { describe, expect, it } from 'vitest';
import { turnLimitOf } from '#/domain/turn-limit.js';

describe('turnLimitOf', () => {
  it('uses the Forge-wide limit and points at Settings, Limits when the agent sets none', () => {
    expect(turnLimitOf(undefined, 3)).toEqual({
      kind: 'turns',
      value: 3,
      source: 'forge',
      fix_href: '/settings/limits#spend',
    });
  });

  it('uses the agent own limit and points at the agents screen when it has one', () => {
    expect(turnLimitOf(12, 40)).toEqual({
      kind: 'turns',
      value: 12,
      source: 'agent',
      fix_href: '/settings/agents',
    });
  });
});
