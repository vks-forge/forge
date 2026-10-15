/**
 * Unsaved-changes registry: lets any view say "I hold edits" so leaving it asks first.
 *
 * Why: a user who is halfway through editing project settings and switches project (or clicks
 *   another screen) would silently lose their work. d-0104 requires an in-page alert in that
 *   case. Views do not know about navigation and navigation does not know about forms, so
 *   they meet here: a view calls `useUnsavedChanges(isDirty)`, and the shell's route guard
 *   and dialog (components/shell/leave-guard.tsx) read the registry. W2, W4 and every
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
  const [dirtyIds, setDirtyIds] = useState<ReadonlySet<string>>(() => new Set());
  const [pending, setPending] = useState<PendingLeave | null>(null);
  const dirty = dirtyIds.size > 0;

  const setDirty = useCallback((id: string, isDirty: boolean) => {
    setDirtyIds((previous) => {
      if (previous.has(id) === isDirty) {
        return previous;
      }

      const next = new Set(previous);
      if (isDirty) {
        next.add(id);
      } else {
        next.delete(id);
      }

      return next;
    });
  }, []);

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
    () => ({ dirty, setDirty, pending, askToLeave, settle }),
    [dirty, setDirty, pending, askToLeave, settle],
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
export function useUnsavedChanges(isDirty: boolean): void {
  const { setDirty } = useUnsavedChangesState();
  const id = useId();

  useEffect(() => {
    setDirty(id, isDirty);
  }, [id, isDirty, setDirty]);

  useEffect(() => () => setDirty(id, false), [id, setDirty]);
}
