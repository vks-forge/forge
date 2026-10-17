/**
 * Unsaved-changes registry: lets any view say "I hold edits" so leaving it asks first.
 *
 * Why: a user who is halfway through editing project settings and switches project (or clicks
 *   another screen) would silently lose their work. d-0104 requires an in-page alert in that
 *   case. Views do not know about navigation and navigation does not know about forms, so
 *   they meet here: a view calls `useUnsavedChanges(isDirty)`, and the shell's route guard
 *   and dialog (components/shell/leave-guard.tsx) read the registry. A screen made of tabs
 *   passes its URL prefix so switching tabs keeps the draft and never asks. W2, W4 and every
 *   later form uses this one hook.
 *
 * Exports: UnsavedChangesProvider, useUnsavedChanges(), useUnsavedChangesState().
 * Depends on: react, types/state.types. IO: a `beforeunload` listener while dirty.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { PendingLeave, UnsavedChangesContextValue } from '#/types/state.types.js';

const UnsavedContext = createContext<UnsavedChangesContextValue | null>(null);

export function UnsavedChangesProvider(props: { children: ReactNode }) {
  // id -> the path prefix inside which navigation keeps the edits (null: any navigation loses them).
  const [dirtyIds, setDirtyIds] = useState<ReadonlyMap<string, string | null>>(
    () => new Map(),
  );

  const [pending, setPending] = useState<PendingLeave | null>(null);
  const dirty = dirtyIds.size > 0;

  const setDirty = useCallback((id: string, isDirty: boolean, stayWithin?: string) => {
    setDirtyIds((previous) => {
      const scope = stayWithin ?? null;
      if (isDirty ? previous.get(id) === scope : !previous.has(id)) {
        return previous;
      }

      const next = new Map(previous);
      if (isDirty) {
        next.set(id, scope);
      } else {
        next.delete(id);
      }

      return next;
    });
  }, []);

  const shouldBlock = useCallback(
    (pathname: string) =>
      [...dirtyIds.values()].some(
        (scope) =>
          scope === null || !(pathname === scope || pathname.startsWith(`${scope}/`)),
      ),
    [dirtyIds],
  );

  // A ref beside the state makes settling idempotent: Radix reports "closed" right after the
  // Discard click, and that second report must not turn a discard into a cancel.
  const pendingRef = useRef<PendingLeave | null>(null);

  const askToLeave = useCallback((leave: PendingLeave) => {
    pendingRef.current = leave;
    setPending(leave);
  }, []);

  const settle = useCallback((decision: 'keep' | 'discard') => {
    const current = pendingRef.current;
    if (current === null) {
      return;
    }

    pendingRef.current = null;
    setPending(null);
    if (decision === 'discard') {
      current.proceed();
    } else {
      current.cancel();
    }
  }, []);

  // Closing or reloading the tab is also a way to lose edits; the browser shows its own prompt.
  useEffect(() => {
    if (!dirty) {
      return undefined;
    }

    const warn = (event: BeforeUnloadEvent): void => event.preventDefault();
    window.addEventListener('beforeunload', warn);

    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const value = useMemo(
    () => ({ dirty, setDirty, shouldBlock, pending, askToLeave, settle }),
    [dirty, setDirty, shouldBlock, pending, askToLeave, settle],
  );

  return (
    <UnsavedContext.Provider value={value}>{props.children}</UnsavedContext.Provider>
  );
}

/** For the shell: the registry itself. */
export function useUnsavedChangesState(): UnsavedChangesContextValue {
  const value = useContext(UnsavedContext);
  if (value === null) {
    throw new Error(
      'Unsaved-changes hooks must be used inside <UnsavedChangesProvider>.',
    );
  }

  return value;
}

/** For a view: report whether it currently holds unsaved edits. Clears itself on unmount. */
export function useUnsavedChanges(isDirty: boolean, stayWithin?: string): void {
  const { setDirty } = useUnsavedChangesState();
  const id = useId();

  useEffect(() => {
    setDirty(id, isDirty, stayWithin);
  }, [id, isDirty, stayWithin, setDirty]);

  useEffect(() => () => setDirty(id, false), [id, setDirty]);
}
