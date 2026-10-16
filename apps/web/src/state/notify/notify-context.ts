/**
 * `NotifyContext`, `useNotify()` and `useNotifyConfig()`: how components reach notifications.
 *
 * Why: a component that has just finished an action should say so with one line,
 *   `useNotify().success('Saved')`, without knowing where the stack sits or how long a toast
 *   lives. The provider supplies the configuration (position, limits, durations); the API
 *   itself is the shared `notifyStore`, so tests and code outside React behave identically.
 *   Without a provider the defaults apply, so a screen rendered alone still works.
 *
 * Exports: NotifyContext, useNotify(), useNotifyConfig().
 * Depends on: react, domain/notify-config, state/notify/notify-store, types/notify.types.
 */

import { createContext, useContext } from 'react';
import { DEFAULT_NOTIFY_CONFIG } from '#/domain/notify-config.js';
import { notifyStore } from '#/state/notify/notify-store.js';
import type {
  NotifyApi,
  NotifyConfig,
  NotifyContextValue,
} from '#/types/notify.types.js';

export const NotifyContext = createContext<NotifyContextValue>({
  config: DEFAULT_NOTIFY_CONFIG,
  api: notifyStore,
});

export function useNotify(): NotifyApi {
  return useContext(NotifyContext).api;
}

export function useNotifyConfig(): NotifyConfig {
  return useContext(NotifyContext).config;
}
