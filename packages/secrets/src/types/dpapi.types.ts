/**
 * Option types for the DPAPI secret store.
 *
 * Why: the store is composed by the app from a directory, and tests need to swap the
 *   PowerShell binary and the platform to prove the failure paths without a second OS.
 *   Naming the options once keeps both adapter files short.
 *
 * Exports: PowerShellOptions, DpapiSecretStoreOptions.
 * Depends on: none. Types only.
 */

export interface PowerShellOptions {
  /** PowerShell executable; defaults to `powershell.exe` (Windows PowerShell 5.1, always present). */
  readonly powershell?: string;
}

export interface DpapiSecretStoreOptions extends PowerShellOptions {
  /** Directory holding the `<name>.dpapi` blobs; created on first write. */
  readonly dir: string;
  /** Platform override for tests; defaults to `process.platform`. */
  readonly platform?: NodeJS.Platform;
}
