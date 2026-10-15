/**
 * Chat trigger — the first ticket source: a person typing to the Director.
 *
 * Why: chat is how every request reaches Forge today (the control room posts a message,
 *   the CLI posts a reply). The web client already builds a full intake envelope with a
 *   client-chosen `dedupe_key` per message, so a double-click or a retry after a dropped
 *   connection redelivers the same key and never makes a second ticket. This adapter is the
 *   boundary that holds the line: it accepts only a valid event that claims the `chat`
 *   source, so a chat client cannot file work as `webhook` or `github_issue` and borrow
 *   another source's trust.
 *
 * Exports: createChatTrigger().
 * Depends on: @forge/core (IntakeEvent, TriggerAdapter). No IO.
 */

import { IntakeEvent } from '@forge/core';
import type { TriggerAdapter } from '@forge/core';

const ChatEvent = IntakeEvent.refine((event) => event.source === 'chat', {
  path: ['source'],
  message: 'the chat trigger only accepts source "chat"',
});

/** The chat adapter: push only, payload is already an intake envelope. */
export function createChatTrigger(): TriggerAdapter {
  return {
    id: 'chat',
    source: 'chat',
    capabilities: () => ({ push: true, poll: false }),
    normalise: (raw) => ChatEvent.parse(raw),
  };
}
