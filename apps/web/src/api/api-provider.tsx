/**
 * React context that hands the ForgeApi to every screen.
 *
 * Why: components must not import the http adapter directly, or a test could not give a screen
 *   an API wired to a stubbed `fetch`. They ask the context for the API instead; `main.tsx`
 *   puts the real adapter there.
 *
 * Exports: ApiProvider, useForgeApi().
 * Depends on: react, types/api.types.
 */

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { ForgeApi } from '#/types/api.types.js';

const ApiContext = createContext<ForgeApi | null>(null);

export function ApiProvider(props: { api: ForgeApi; children: ReactNode }) {
  return <ApiContext.Provider value={props.api}>{props.children}</ApiContext.Provider>;
}

/** The API for this app; screens call `useForgeApi().projects.list()` through TanStack Query. */
export function useForgeApi(): ForgeApi {
  const value = useContext(ApiContext);
  if (value === null) {
    throw new Error('useForgeApi() must be used inside <ApiProvider>.');
  }

  return value;
}
