/**
 * NotifyProvider: mounts the notification viewport once and supplies its configuration.
 *
 * Why: notifications must look and behave the same on every screen, so the app wraps itself
 *   in one provider that owns the single viewport. Where it sits, how many show at once and
 *   how long each tone lasts are props, so a product or a test can change them in one place.
 *
 * Exports: NotifyProvider.
 * Depends on: react, components/notify/notify-viewport, domain/notify-config,
 *   state/notify/notify-context, state/notify/notify-store, types/notify.types.
 */

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { NotifyViewport } from '#/components/notify/notify-viewport.js';
import { resolveNotifyConfig } from '#/domain/notify-config.js';
import { NotifyContext } from '#/state/notify/notify-context.js';
import { notifyStore } from '#/state/notify/notify-store.js';
import type { NotifyConfigInput } from '#/types/notify.types.js';

export function NotifyProvider(props: NotifyConfigInput & { children: ReactNode }) {
  const { children, position, max, defaultDuration, gap, offset } = props;
  const durationKey = JSON.stringify(defaultDuration ?? null);
  const value = useMemo(
    () => ({
      config: resolveNotifyConfig({
        ...(position ? { position } : {}),
        ...(max !== undefined ? { max } : {}),
        ...(defaultDuration ? { defaultDuration } : {}),
        ...(gap !== undefined ? { gap } : {}),
        ...(offset !== undefined ? { offset } : {}),
      }),
      api: notifyStore,
    }),
    // `defaultDuration` is compared by content so an inline object does not rebuild the value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [position, max, durationKey, gap, offset],
  );

  return (
    <NotifyContext.Provider value={value}>
      {children}
      <NotifyViewport />
    </NotifyContext.Provider>
  );
}
