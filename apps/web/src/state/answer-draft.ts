/**
 * `useAnswerDraft(interactionId)`: the text typed into a question's answer box.
 *
 * Why: answering is optimistic, so the form disappears the moment the user sends. If the
 *   server then refuses, the form returns and the answer they wrote must still be in it;
 *   typing a paragraph twice because of a network blip is the failure this prevents. The
 *   draft therefore lives outside the form component. The hook is the only door to it
 *   (d-0122); in memory today, so a reload clears it, and never sent anywhere.
 *
 * Exports: useAnswerDraft(), useClearAnswerDraft().
 * Depends on: state/ui-store.
 */

import { createUiStore, useUiStore } from '#/state/ui-store.js';

/** The record without one key. */
function without(
  drafts: Readonly<Record<string, string>>,
  key: string,
): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(drafts).filter(([id]) => id !== key));
}

const store = createUiStore<Readonly<Record<string, string>>>({});

export function useAnswerDraft(interactionId: string) {
  const drafts = useUiStore(store);

  return {
    draft: drafts[interactionId] ?? '',
    setDraft: (text: string): void => store.set((d) => ({ ...d, [interactionId]: text })),
    clearDraft: (): void => store.set((d) => without(d, interactionId)),
  };
}

/** Drops the draft of any interaction by id; for the parent that sends the answer. */
export function useClearAnswerDraft(): (interactionId: string) => void {
  return (interactionId) => store.set((d) => without(d, interactionId));
}
