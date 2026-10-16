/**
 * `useNotifyTask()`: mirrors a polled server job into one live notification.
 *
 * Why: some work outlives the screen that started it (the compatibility checks, a long
 *   run). A component polling the job should be able to say "here is its state now" on every
 *   render and get exactly one notification that fills in as the job advances, survives
 *   navigation and re-mounting, and turns into a success or an error at the end. It is
 *   idempotent by id: the first running state creates the card, later ones update it, a
 *   finished state resolves it only if the card is still showing progress (a job that was
 *   already done when the page opened is old news), and a card the user closed stays closed.
 *
 * Exports: useNotifyTask().
 * Depends on: react, state/notify/notify-context, state/notify/notify-store, types/notify.types.
 */

import { useEffect, useRef } from 'react';
import { useNotify } from '#/state/notify/notify-context.js';
import { isTaskClosed } from '#/state/notify/notify-store.js';
import type { NotifyTaskState } from '#/types/notify.types.js';

/**
 * `id` is the stable identity of the job (`compat:${slug}`); pass `null` for `state` while
 * there is no job. Callbacks (`action`, `onCancel`) may change identity every render.
 */
export function useNotifyTask(
  id: string,
  state: NotifyTaskState | null | undefined,
): void {
  const notify = useNotify();
  const latest = useRef(state);

  useEffect(() => {
    latest.current = state;
  });

  const signature = state
    ? JSON.stringify([
        state.status,
        state.title,
        state.description,
        state.progress,
        state.steps,
        state.action?.label,
        state.onCancel !== undefined,
        state.successTitle,
        state.failTitle,
      ])
    : null;

  useEffect(() => {
    const current = latest.current;

    if (!current) {
      return;
    }

    const existing = notify.get(id);

    if (current.status === 'running') {
      if (existing?.task === true && existing.tone === 'loading') {
        notify.update(id, {
          title: current.title,
          description: current.description,
          progress: current.progress,
          steps: current.steps,
          action: current.action,
          onCancel: current.onCancel,
        });
      } else if (!isTaskClosed(id)) {
        notify.task({ ...current, id });
      }

      return;
    }

    if (existing?.task !== true || existing.tone !== 'loading') {
      return;
    }

    // The card hides the bar and Cancel once the tone is no longer `loading`; the steps stay
    // so a failure still shows which check broke.
    const succeeded = current.status === 'succeeded';

    notify.update(id, {
      tone: succeeded ? 'success' : 'error',
      title: (succeeded ? current.successTitle : current.failTitle) ?? current.title,
      description: current.description,
      steps: current.steps,
    });
  }, [id, notify, signature]);
}
