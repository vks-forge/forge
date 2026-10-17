/**
 * `useEscalationFocus()`: what "Show the first" in the escalation banner does.
 *
 * Why: the escalation card lives in the chat, which is only mounted on the Conversation tab. The
 *   banner button therefore focuses the card when it is on screen, and
 *   otherwise opens the Conversation tab and focuses it as soon as it appears, so one click always lands
 *   the owner on the thing to act on (d-0135). If the card is not in the loaded history the focus
 *   simply waits; the banner's ticket links remain the way in.
 *
 * Exports: useEscalationFocus().
 * Depends on: react, components/escalation/escalation-card, types/cards-ui.types.
 */

import { useEffect, useRef } from 'react';
import { escalationDomId } from '#/components/escalation/escalation-card.js';
import type { CardTab } from '#/types/cards-ui.types.js';

export function useEscalationFocus(input: {
  tab: CardTab;
  goTab: (tab: CardTab) => void;
}): (interactionId: string) => void {
  const { tab, goTab } = input;
  const waiting = useRef<string | null>(null);

  const focusIt = (interactionId: string): boolean => {
    const element = document.getElementById(escalationDomId(interactionId));
    element?.focus();
    element?.scrollIntoView({ block: 'nearest' });

    return element !== null;
  };

  // The card is not mounted until the Conversation tab is: focus it once it is.
  useEffect(() => {
    const id = waiting.current;
    if (id !== null && tab === 'conversation' && focusIt(id)) {
      waiting.current = null;
    }
  });

  return (interactionId) => {
    if (!focusIt(interactionId)) {
      waiting.current = interactionId;
      goTab('conversation');
    }
  };
}
