/**
 * Shapes of the app-wide client state: theme and unsaved-changes registry.
 *
 * Why: both are React contexts consumed from many components; typing them once keeps the
 *   provider and its hooks honest about what a consumer may call.
 *
 * Exports: ThemeContextValue, PendingLeave, UnsavedChangesContextValue, SubmitState.
 * Depends on: types/nav.types. Types only.
 */

import type { ThemeMode } from '#/types/nav.types.js';

/** What `useSubmit()` returns: the write, its state, and a way back to idle. */
export interface SubmitState<Args extends unknown[], Result> {
  readonly run: (...args: Args) => Promise<Result | undefined>;
  readonly reset: () => void;
  readonly status: 'idle' | 'pending' | 'success' | 'error';
  readonly error: unknown;
  readonly pending: boolean;
}

export interface ThemeContextValue {
  readonly mode: ThemeMode;
  readonly setMode: (mode: ThemeMode) => void;
  /** Advances system, light, dark, system. */
  readonly cycle: () => void;
}

/** A navigation that is waiting for the user to decide what to do with unsaved edits. */
export interface PendingLeave {
  /** Carry on and lose the edits. */
  readonly proceed: () => void;
  /** Stay where we are. */
  readonly cancel: () => void;
}

export interface UnsavedChangesContextValue {
  /** True while any registered view has unsaved edits. */
  readonly dirty: boolean;
  /**
   * A view reports whether it has unsaved edits; `id` identifies the view. `stayWithin` is a
   * path prefix inside which moving around keeps the edits alive (the tabs of one settings
   * screen), so only leaving it asks.
   */
  readonly setDirty: (id: string, dirty: boolean, stayWithin?: string) => void;
  /** Whether going to `pathname` would lose edits some view holds. */
  readonly shouldBlock: (pathname: string) => boolean;
  /** Non-null while the "keep editing or discard" question is open. */
  readonly pending: PendingLeave | null;
  /** Opens the question; `proceed` runs only if the user chooses to discard. */
  readonly askToLeave: (leave: PendingLeave) => void;
  /** Closes the question after the user answered. */
  readonly settle: (decision: 'keep' | 'discard') => void;
}
