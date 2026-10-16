/**
 * `mountNotify()`: mounts the real notification provider and viewport around some children.
 *
 * Why: notification tests drive the shipped provider, viewport and cards (not fakes), and
 *   several need to re-render the same tree with new children (a polled job changing state).
 *   One helper keeps the wrapper, the motion setting and that re-render in one place.
 *
 * Exports: mountNotify(), notifyIds().
 * Depends on: @testing-library/react, motion/react, components/notify/notify-provider,
 *   state/notify/notify-store, types/notify.types.
 */

import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';
import { NotifyProvider } from '#/components/notify/notify-provider.js';
import { useNotifyStore } from '#/state/notify/notify-store.js';
import type { NotifyConfigInput } from '#/types/notify.types.js';

export function mountNotify(
  children: ReactNode = null,
  config: NotifyConfigInput = {},
): RenderResult & { update: (next: ReactNode) => void } {
  const wrap = (inner: ReactNode) => (
    <MotionConfig reducedMotion="user">
      <NotifyProvider {...config}>{inner}</NotifyProvider>
    </MotionConfig>
  );

  const view = render(wrap(children));

  return { ...view, update: (next: ReactNode) => view.rerender(wrap(next)) };
}

/** Ids of the notifications currently in the store, oldest first. */
export function notifyIds(): string[] {
  return useNotifyStore.getState().items.map((item) => item.id);
}
