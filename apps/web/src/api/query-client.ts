/**
 * `createQueryClient()`: the TanStack Query defaults for this app.
 *
 * Why: the defaults retry three times with growing delays, so a stopped Forge server shows a
 *   loading skeleton for seven seconds before admitting failure. Network failures get one quick
 *   retry; a refusal (401, 404, bad payload) will not change by asking again and fails at once,
 *   so the error state, with its "Try again" button, appears immediately. Data is treated as
 *   fresh for 15 s so moving between screens does not refetch the project list every time.
 *
 * Exports: createQueryClient().
 * Depends on: @tanstack/react-query, api/api-error.
 */

import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '#/api/api-error.js';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: false,
        retry: (failures, error) =>
          failures < 1 && error instanceof ApiError && error.kind === 'network',
        retryDelay: 400,
      },
    },
  });
}
