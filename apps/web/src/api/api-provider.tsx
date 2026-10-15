/**
 * React context that hands the composed ForgeApi to every screen.
 *
 * Why: components must not import an adapter, or tests and the fixture build could not swap
 *   the data source. They ask the context for the API (and for which resources are currently
 *   served from fixtures, so the shell can say so honestly).
 *
 * Exports: ApiProvider, useForgeApi(), useDataSources().
 * Depends on: react, api/adapter-table, types/api.types.
 */

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { sourcesOf } from '#/api/adapter-table.js';
import type { AdapterTable, ApiContextValue, ForgeApi } from '#/types/api.types.js';

const ApiContext = createContext<ApiContextValue | null>(null);

export function ApiProvider(props: {
  api: ForgeApi;
  table: AdapterTable;
  children: ReactNode;
}) {
  const { api, table, children } = props;
  const value = useMemo(
    () => ({ api, usesFixtures: sourcesOf(table).includes('mock') }),
    [api, table],
  );

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

function useApiContext(): ApiContextValue {
  const value = useContext(ApiContext);
  if (value === null) {
    throw new Error('useForgeApi() must be used inside <ApiProvider>.');
  }

  return value;
}

/** The API for this app; screens call `useForgeApi().projects.list()` through TanStack Query. */
export function useForgeApi(): ForgeApi {
  return useApiContext().api;
}

/** True while any resource is served from fixtures instead of the Forge server. */
export function useDataSources(): { usesFixtures: boolean } {
  return { usesFixtures: useApiContext().usesFixtures };
}
