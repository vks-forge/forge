/**
 * The notification store and `notifyStore`, the API that works from anywhere.
 *
 * Why: the messages that matter most come from places with no React tree around them: a
 *   mutation's `onError`, a poll that notices a job finished, a promise chain. The items live
 *   in one module-level zustand store (never persisted: a notification about a past action
 *   must not greet the user after a reload) and `notifyStore` is the one set of functions that
 *   changes it, so a component calling `useNotify()` and a plain function calling
 *   `notifyStore.error()` do the same thing. Showing with an existing id replaces that
 *   notification in place, which is what makes re-reporting a job's progress safe. A task the
 *   user dismissed while it ran is remembered, so a poll that keeps reporting it does not
 *   bring it back.
 *
 * Exports: notifyStore (incl. dismissAll: close every dismissible card but running tasks), useNotifyStore.
 * Depends on: state/create-transient-store, state/ui-store-registry, types/notify.types. No IO.
 */

import { createTransientStore } from '#/state/create-transient-store.js';
import { registerUiStore } from '#/state/ui-store-registry.js';
import { isRunningTask } from '#/domain/notify-config.js';
import type {
  NotifyApi,
  NotifyInput,
  NotifyItem,
  NotifyOptions,
  NotifyPatch,
  NotifyPromiseMessages,
  NotifyStoreState,
  NotifyTaskHandle,
  NotifyTaskInput,
  NotifyTone,
} from '#/types/notify.types.js';

export const useNotifyStore = createTransientStore<NotifyStoreState>({ items: [] });

/** Ids of running tasks the user closed; cleared when the task is started again or finishes. */
const closedTasks = new Set<string>();

registerUiStore(() => closedTasks.clear());

let sequence = 0;

function read(): readonly NotifyItem[] {
  return useNotifyStore.getState().items;
}

function write(items: readonly NotifyItem[]): void {
  useNotifyStore.setState({ items });
}

function definedOnly(patch: NotifyPatch): Partial<NotifyItem> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<NotifyItem>;
}

function show(input: NotifyInput): string {
  const id = input.id ?? `notify-${++sequence}`;
  const items = read();
  const index = items.findIndex((item) => item.id === id);
  const previous = index >= 0 ? items[index] : undefined;
  const item: NotifyItem = {
    id,
    tone: input.tone,
    title: input.title,
    description: input.description,
    action: input.action,
    duration: input.duration,
    dismissible: input.dismissible ?? true,
    icon: input.icon,
    progress: input.progress,
    steps: input.steps,
    onCancel: input.onCancel,
    task: input.task ?? false,
    revision: (previous?.revision ?? 0) + 1,
  };

  if (item.task) {
    closedTasks.delete(id);
  }

  write(
    previous
      ? items.map((existing) => (existing.id === id ? item : existing))
      : [...items, item],
  );

  return id;
}

function update(id: string, patch: NotifyPatch): void {
  const items = read();
  const previous = items.find((item) => item.id === id);

  if (!previous) {
    return;
  }

  const next: NotifyItem = {
    ...previous,
    ...definedOnly(patch),
    revision: previous.revision + 1,
  };

  // A new tone brings its own lifetime unless the caller set one: a loading item that turns
  // into a success must then leave after the success default, not stay forever.
  if (
    patch.tone !== undefined &&
    patch.tone !== previous.tone &&
    patch.duration === undefined
  ) {
    next.duration = undefined;
  }

  write(items.map((item) => (item.id === id ? next : item)));
}

function dismiss(id?: string): void {
  const items = read();

  for (const item of items) {
    if ((id === undefined || item.id === id) && isRunningTask(item)) {
      closedTasks.add(item.id);
    }
  }

  write(id === undefined ? [] : items.filter((item) => item.id !== id));
}

function dismissAll(): number {
  const items = read();
  const closing = items.filter((item) => item.dismissible && !isRunningTask(item));

  if (closing.length > 0) {
    const ids = new Set(closing.map((item) => item.id));

    write(items.filter((item) => !ids.has(item.id)));
  }

  return closing.length;
}

function toned(tone: NotifyTone) {
  return (title: string, options: NotifyOptions = {}): string =>
    show({ ...options, tone, title });
}

function promise<T>(source: Promise<T>, messages: NotifyPromiseMessages<T>): Promise<T> {
  const id = show({ id: messages.id, tone: 'loading', title: messages.loading });

  source.then(
    (value) =>
      update(id, {
        tone: 'success',
        title:
          typeof messages.success === 'function'
            ? messages.success(value)
            : messages.success,
      }),
    (error: unknown) =>
      update(id, {
        tone: 'error',
        title:
          typeof messages.error === 'function' ? messages.error(error) : messages.error,
      }),
  );

  return source;
}

function finish(
  id: string,
  tone: 'success' | 'error',
  title: string,
  options: NotifyOptions,
): void {
  closedTasks.delete(id);

  const previous = read().find((item) => item.id === id);

  if (!previous) {
    // The user closed the progress card; the outcome is still worth telling.
    show({ ...options, id, tone, title });

    return;
  }

  write(
    read().map((item) =>
      item.id === id
        ? {
            ...previous,
            tone,
            title,
            description: options.description,
            action: options.action,
            duration: options.duration,
            icon: options.icon,
            dismissible: options.dismissible ?? true,
            progress: undefined,
            onCancel: undefined,
            revision: previous.revision + 1,
          }
        : item,
    ),
  );
}

function task(input: NotifyTaskInput): NotifyTaskHandle {
  const id = show({
    id: input.id,
    tone: 'loading',
    title: input.title,
    description: input.description,
    progress: input.progress,
    steps: input.steps,
    action: input.action,
    onCancel: input.onCancel,
    task: true,
  });

  return {
    id,
    update: (patch) => update(id, patch),
    succeed: (title, options = {}) => finish(id, 'success', title, options),
    fail: (title, options = {}) => finish(id, 'error', title, options),
    dismiss: () => dismiss(id),
  };
}

/** True when the user closed this running task and it should stay closed. */
export function isTaskClosed(id: string): boolean {
  return closedTasks.has(id);
}

export const notifyStore: NotifyApi = {
  show,
  success: toned('success'),
  error: toned('error'),
  info: toned('info'),
  warning: toned('warning'),
  loading: toned('loading'),
  update,
  dismiss,
  dismissAll,
  promise,
  task,
  get: (id) => read().find((item) => item.id === id),
};
