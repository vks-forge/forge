/**
 * `useAuthorPrefs()`: the name recorded on settings saves and tool decisions.
 *
 * Why: every settings version and tool approval is kept with who made it and why, so the
 *   history answers "who changed the global cap last Tuesday". The server has no login or
 *   profile call yet, so the name is typed once, shared by every form on the page and kept
 *   across reloads (`forge.ui.author`, d-0122) instead of asked again. It is a label for the
 *   audit trail, not an identity check.
 *
 * Exports: useAuthorPrefs(), authorPrefsStore.
 * Depends on: state/create-persisted-store, schemas/ui-state, types/ui-state.types.
 */

import { AuthorPrefsSchema } from '#/schemas/ui-state.js';
import { createPersistedStore } from '#/state/create-persisted-store.js';
import type { AuthorPrefs } from '#/types/ui-state.types.js';

export const authorPrefsStore = createPersistedStore<AuthorPrefs>({
  name: 'author',
  version: 1,
  initial: { author: '' },
  schema: AuthorPrefsSchema,
});

function setAuthor(author: string): void {
  authorPrefsStore.setState({ author });
}

export function useAuthorPrefs(): readonly [string, (name: string) => void] {
  const author = authorPrefsStore((p) => p.author);

  return [author, setAuthor];
}
