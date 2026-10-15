/**
 * AppProviders: every app-wide context in one place, in the right order.
 *
 * Why: motion, theme, data, queries and the unsaved-changes registry must wrap every screen
 *   and the test harness identically, or a test would pass against a different app than the
 *   one users run. `MotionConfig reducedMotion="user"` is the single switch that makes all
 *   springs respect the OS "reduce motion" setting (transforms stop, opacity fades remain).
 *   The router sits inside these so route components can use all of them.
 *
 * Exports: AppProviders.
 * Depends on: react, @tanstack/react-query, motion/react, api/api-provider, api/query-client,
 *   state/theme-provider, state/unsaved-changes, types/api.types.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';
import { ApiProvider } from '#/api/api-provider.js';
import { ThemeProvider } from '#/state/theme-provider.js';
import { UnsavedChangesProvider } from '#/state/unsaved-changes.js';
import type { AdapterTable, ForgeApi } from '#/types/api.types.js';

export function AppProviders(props: {
  api: ForgeApi;
  table: AdapterTable;
  queryClient: QueryClient;
  children: ReactNode;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <ApiProvider api={props.api} table={props.table}>
          <QueryClientProvider client={props.queryClient}>
            <UnsavedChangesProvider>{props.children}</UnsavedChangesProvider>
          </QueryClientProvider>
        </ApiProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}
