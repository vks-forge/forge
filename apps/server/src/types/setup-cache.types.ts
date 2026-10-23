/**
 * Types of the setup cache admin.
 *
 * Why: the routes and the service share one shape for "how big is the cache" and "what did a
 *   clear remove", so the settings screen and its tests read the same fields.
 *
 * Exports: SetupCacheSizes, SetupCacheClearResult, SetupCacheAdmin, SetupCacheAdminDeps.
 * Depends on: none. Types only.
 */

/** Bytes used by the copied install folders and by the shared package downloads. */
export interface SetupCacheSizes {
  readonly setup_bytes: number;
  readonly downloads_bytes: number;
}

/** What a clear removed: the bytes freed and which parts were emptied. */
export interface SetupCacheClearResult {
  readonly freed_bytes: number;
  readonly cleared: readonly ('setup' | 'downloads')[];
}

export interface SetupCacheAdmin {
  /** Current sizes; reused for a minute. */
  sizes(): Promise<SetupCacheSizes>;
  /** Empties `setup/`, and `downloads/` as well when asked. */
  clear(includeDownloads: boolean): Promise<SetupCacheClearResult>;
}

export interface SetupCacheAdminDeps {
  /** `<data home>/cache`. */
  readonly cacheDir: string;
  readonly now: () => number;
}
