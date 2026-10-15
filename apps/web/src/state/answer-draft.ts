/**
 * `useAnswerDraft(interactionId)`: the text typed into a question's answer box.
 *
 * Why: answering is optimistic, so the form disappears the moment the user sends. If the
 *   server then refuses, the form returns and the answer they wrote must still be in it;
 *   typing a paragraph twice because of a network blip is the failure this prevents. The
 *   draft therefore lives outside the form component, and in `localStorage` (`forge.ui.drafts`)
 *   so a reload or a closed tab does not lose a half-written answer either (d-0122). It is
 *   never sent anywhere, and it is dropped the moment the answer is accepted.
 *
 * Exports: useAnswerDraft(), useClearAnswerDraft(), answerDraftsStore.
 * Depends on: state/create-persisted-store, schemas/ui-state, types/ui-state.types.
 */

import { AnswerDraftsSchema } from '#/schemas/ui-state.js';
import { createPersistedStore } from '#/state/create-persisted-store.js';
import type { AnswerDrafts } from '#/types/ui-state.types.js';

export const answerDraftsStore = createPersistedStore<AnswerDrafts>({
  name: 'drafts',
  version: 1,
  initial: { drafts: {} },
  schema: AnswerDraftsSchema,
});

function setDraftOf(id: string, text: string): void {
  answerDraftsStore.setState((s) => ({ drafts: { ...s.drafts, [id]: text } }));
}

/** Removes one draft; an empty box is not worth a storage entry either. */
function clearDraftOf(id: string): void {
  answerDraftsStore.setState((s) => ({
    drafts: Object.fromEntries(Object.entries(s.drafts).filter(([key]) => key !== id)),
  }));
}

export function useAnswerDraft(interactionId: string) {
  const draft = answerDraftsStore((s) => s.drafts[interactionId]) ?? '';

  return {
    draft,
    setDraft: (text: string): void =>
      text === '' ? clearDraftOf(interactionId) : setDraftOf(interactionId, text),
    clearDraft: (): void => clearDraftOf(interactionId),
  };
}

/** Drops the draft of any interaction by id; for the parent that sends the answer. */
export function useClearAnswerDraft(): (interactionId: string) => void {
  return clearDraftOf;
}
