/**
 * Types of the notification system: what a notification carries, what the provider can be
 * configured with, and the API every caller (React or not) uses.
 *
 * Why: every action in Forge ends in "it worked", "it failed" or "it is still going", and
 *   those messages come from components, mutation callbacks and long-running jobs alike.
 *   One shape for a notification and one API surface keep them all looking and behaving the
 *   same: same placement, same durations, same undo and progress affordances.
 *
 * Exports: NotifyTone, NotifyPosition, NotifyAction, NotifyInput, NotifyOptions, NotifyPatch,
 *   NotifyItem, NotifyProgress, NotifyStep, NotifyStepStatus, NotifyTaskInput,
 *   NotifyTaskPatch, NotifyTaskHandle, NotifyTaskState, NotifyPromiseMessages, NotifyApi,
 *   NotifyConfig, NotifyConfigInput, NotifyContextValue, NotifyStoreState.
 * Depends on: react (ReactNode type only). Types only.
 */

import type { ReactNode } from 'react';

export type NotifyTone = 'success' | 'error' | 'info' | 'warning' | 'loading';

export type NotifyPosition =
  'bottom-center' | 'bottom-right' | 'top-center' | 'top-right';

/** A button on the notification. Dismisses afterwards unless it returns `false` (or the notification is a running task). */
export interface NotifyAction {
  label: string;
  onClick: () => boolean | void | Promise<boolean | void>;
}

/** How far a task has got. With no `value` the bar is indeterminate. `max` defaults to 100. */
export interface NotifyProgress {
  value?: number | undefined;
  max?: number | undefined;
  /** Replaces the default "3 of 7" or "42%" text, e.g. "3 of 7 checks". */
  label?: string | undefined;
}

export type NotifyStepStatus = 'pending' | 'running' | 'pass' | 'fail' | 'skip';

export interface NotifyStep {
  label: string;
  status: NotifyStepStatus;
}

export interface NotifyInput {
  tone: NotifyTone;
  title: string;
  description?: string | undefined;
  action?: NotifyAction | undefined;
  /** Milliseconds; `null` stays until dismissed. Default depends on the tone. */
  duration?: number | null | undefined;
  dismissible?: boolean | undefined;
  /** Same id replaces the notification in place instead of stacking another. */
  id?: string | undefined;
  icon?: ReactNode;
  progress?: NotifyProgress | undefined;
  steps?: readonly NotifyStep[] | undefined;
  onCancel?: (() => void) | undefined;
  /** Marks a long-running job: pinned to the stack, never auto-dismissed while running. */
  task?: boolean | undefined;
}

export type NotifyOptions = Omit<NotifyInput, 'tone' | 'title'>;

/** Fields to change; an `undefined` field is left as it is. */
export type NotifyPatch = {
  [K in keyof Omit<NotifyInput, 'id'>]?: NotifyInput[K] | undefined;
};

/** What the store holds: an input with its id, defaults filled in and a revision that restarts timers. */
export interface NotifyItem {
  id: string;
  tone: NotifyTone;
  title: string;
  description?: string | undefined;
  action?: NotifyAction | undefined;
  duration?: number | null | undefined;
  dismissible: boolean;
  icon?: ReactNode;
  progress?: NotifyProgress | undefined;
  steps?: readonly NotifyStep[] | undefined;
  onCancel?: (() => void) | undefined;
  task: boolean;
  revision: number;
}

export interface NotifyTaskInput {
  id?: string | undefined;
  title: string;
  description?: string | undefined;
  progress?: NotifyProgress | undefined;
  steps?: readonly NotifyStep[] | undefined;
  action?: NotifyAction | undefined;
  onCancel?: (() => void) | undefined;
}

export interface NotifyTaskPatch {
  title?: string | undefined;
  description?: string | undefined;
  progress?: NotifyProgress | undefined;
  steps?: readonly NotifyStep[] | undefined;
}

/** Drives one running job's notification. */
export interface NotifyTaskHandle {
  id: string;
  update: (patch: NotifyTaskPatch) => void;
  succeed: (title: string, options?: NotifyOptions) => void;
  fail: (title: string, options?: NotifyOptions) => void;
  dismiss: () => void;
}

/** What a polled server job looks like to `useNotifyTask()`. */
export interface NotifyTaskState {
  status: 'running' | 'succeeded' | 'failed';
  title: string;
  description?: string | undefined;
  progress?: NotifyProgress | undefined;
  steps?: readonly NotifyStep[] | undefined;
  action?: NotifyAction | undefined;
  onCancel?: (() => void) | undefined;
  /** Title once finished; defaults to `title`. */
  successTitle?: string | undefined;
  failTitle?: string | undefined;
}

export interface NotifyPromiseMessages<T> {
  loading: string;
  success: string | ((value: T) => string);
  error: string | ((error: unknown) => string);
  id?: string | undefined;
}

export interface NotifyApi {
  show: (input: NotifyInput) => string;
  success: (title: string, options?: NotifyOptions) => string;
  error: (title: string, options?: NotifyOptions) => string;
  info: (title: string, options?: NotifyOptions) => string;
  warning: (title: string, options?: NotifyOptions) => string;
  loading: (title: string, options?: NotifyOptions) => string;
  update: (id: string, patch: NotifyPatch) => void;
  /** No id dismisses everything. */
  dismiss: (id?: string) => void;
  /** Closes every dismissible notification except running tasks; returns how many closed. */
  dismissAll: () => number;
  promise: <T>(promise: Promise<T>, messages: NotifyPromiseMessages<T>) => Promise<T>;
  task: (input: NotifyTaskInput) => NotifyTaskHandle;
  get: (id: string) => NotifyItem | undefined;
}

export interface NotifyConfig {
  position: NotifyPosition;
  /** How many one-off notifications show at once; older ones queue behind. Running tasks do not count. */
  max: number;
  defaultDuration: Readonly<Record<NotifyTone, number | null>>;
  /** Space between cards when the stack is expanded, px. */
  gap: number;
  /** Distance from the screen edge, px (safe area is added on top). */
  offset: number;
}

export interface NotifyConfigInput {
  position?: NotifyPosition;
  max?: number;
  defaultDuration?: Partial<Record<NotifyTone, number | null>>;
  gap?: number;
  offset?: number;
}

export interface NotifyContextValue {
  config: NotifyConfig;
  api: NotifyApi;
}

/** What the notification store holds, oldest first. */
export interface NotifyStoreState {
  items: readonly NotifyItem[];
}
