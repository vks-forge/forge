/**
 * `useMessageDraft(key)`: the text typed into a chat or steer composer, kept per target.
 *
 * Why: a message to a card's Director or to a running Worker is sent optimistically and can
 *   be refused (the card closed, the run ended, Forge restarting). The words must survive the
 *   refusal, a reload and a visit to another card, so they live outside the form in the same
 *   persisted drafts store as answers (`forge.ui.drafts`, d-0122), under a prefixed key
 *   (`card:<id>`, `run:<id>`) that cannot collide with an interaction id. Dropped on success.
 *
 * Exports: useMessageDraft(), cardDraftKey(), runDraftKey().
 * Depends on: state/answer-draft. No IO of its own.
 */

import { useAnswerDraft } from '#/state/answer-draft.js';

export const cardDraftKey = (cardId: string): string => `card:${cardId}`;
export const runDraftKey = (runId: string): string => `run:${runId}`;

export function useMessageDraft(key: string) {
  return useAnswerDraft(key);
}
