/**
 * Pins: the owner-facing words for a Worker that used all its turns: the number it used, the setting
 * to raise by its screen label, where that setting lives, and that Retry is the next step.
 *
 * Why: the eval showed this stop as "ran out of turns" with no number and no way to act. The owner
 *   fixes it only by raising the right limit (the Forge-wide one or the agent's own), so the words must
 *   name it as the screen does, link to it, and never show a harness or an enum value.
 * Depends on: domain/turn-limit-copy.
 */

import { describe, expect, it } from 'vitest';
import { turnLimitHelp } from '#/domain/turn-limit-copy.js';

const flat = (p: ReturnType<typeof turnLimitHelp>): string =>
  `${p.lead}${p.setting}${p.mid}${p.linkText}${p.tail}`;

describe('turnLimitHelp', () => {
  it('names the turns used, the Forge setting by its label and the Limits screen', () => {
    const help = turnLimitHelp({
      kind: 'turns',
      value: 3,
      source: 'forge',
      fix_href: '/settings/limits#spend',
    });

    expect(flat(help)).toBe(
      'The Worker used all 3 of its turns before finishing. Raise Turns per run (now 3) in Settings → Limits, then Retry.',
    );

    expect(help.setting).toBe('Turns per run');
    expect(help.href).toBe('/settings/limits#spend');
  });

  it('names the agent own Turn limit and the Agents screen when the agent set one', () => {
    const help = turnLimitHelp({
      kind: 'turns',
      value: 12,
      source: 'agent',
      fix_href: '/settings/agents',
    });

    expect(flat(help)).toBe(
      'The Worker used all 12 of its turns before finishing. Raise this agent’s Turn limit (now 12) in Settings → Agents, then Retry.',
    );

    expect(help.href).toBe('/settings/agents');
    expect(flat(help)).not.toMatch(/claude|harness|max_turns/i);
  });
});
