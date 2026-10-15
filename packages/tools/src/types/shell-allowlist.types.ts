/**
 * Input type of the per-project shell allow-list.
 *
 * Why: the tools package reads no project settings, so what the allow-list is built from
 *   (the project's check commands and ecosystems) crosses in as plain data; the engine and
 *   server fill it from settings. One shape keeps both sides honest.
 *
 * Exports: ShellAllowInput.
 * Depends on: none. Types only.
 */

/** What the project says it runs: its check commands and the ecosystems it uses. */
export interface ShellAllowInput {
  readonly commands: readonly string[];
  readonly ecosystems: readonly string[];
  /** The checks with their working directories; interpreter-led ones become exact rules. */
  readonly checks?: readonly { readonly command: string; readonly cwd?: string }[];
  /** The directory the run's shell calls start in; checks' `cwd` is relative to it. */
  readonly runCwd?: string;
}
