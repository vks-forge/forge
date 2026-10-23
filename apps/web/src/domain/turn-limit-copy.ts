/**
 * Turn-limit copy: the sentence that tells the owner a Worker used all its turns and where to raise them.
 *
 * Why: a stop on the turn limit is fixed only by raising a setting, and before this the owner saw "ran out of
 *   turns" with no number and no way to act. The sentence names the turns used, the setting by the label the
 *   screen shows (Forge's "Turns per run", or the agent's own "Turn limit") and the screen that holds it, then
 *   points at Retry. It comes in parts so the card can bold the setting and link the screen. Plain words only.
 *
 * Exports: turnLimitHelp().
 * Depends on: types/escalation-ui.types (types). Pure.
 */

import type { TurnLimit, TurnLimitHelp } from '#/types/escalation-ui.types.js';

/** The sentence for `limit`, in parts; the link goes where the server's `fix_href` says. */
export function turnLimitHelp(limit: TurnLimit): TurnLimitHelp {
  const own = limit.source === 'agent';

  return {
    lead: `The Worker used all ${limit.value} of its turns before finishing. Raise ${own ? 'this agent’s ' : ''}`,
    setting: own ? 'Turn limit' : 'Turns per run',
    mid: ` (now ${limit.value}) in `,
    linkText: own ? 'Settings → Agents' : 'Settings → Limits',
    tail: ', then Retry.',
    href: limit.fix_href,
  };
}
