/**
 * `useAuthorPrefs()`: the name recorded on settings saves and tool decisions.
 *
 * Why: every settings version and tool approval is kept with who made it and why, so the
 *   history answers "who changed the global cap last Tuesday". The server has no login or
 *   profile call yet, so the name is typed once and shared by every form on the page instead
 *   of asked again. It is a label for the audit trail, not an identity check. Per decision
 *   d-0122 UI state that should survive a reload sits behind a `use<Feature>Prefs()` hook;
 *   for now it lives in memory (shared across components, lost on reload) and the hook will
 *   be backed by a persisted store later without changing callers. No browser storage here.
 *
 * Exports: useAuthorPrefs().
 * Depends on: react.
 */

import { useCallback, useSyncExternalStore } from 'react';

let author = '';
const listeners = new Set<() => void>();

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

export function useAuthorPrefs(): readonly [string, (name: string) => void] {
  const current = useSyncExternalStore(subscribe, () => author);
  const setAuthor = useCallback((name: string) => {
    author = name;
    listeners.forEach((listener) => listener());
  }, []);

  return [current, setAuthor];
}
