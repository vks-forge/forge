/**
 * Options of the `claude` binary resolver.
 *
 * Why: resolving the executable needs the platform, the host PATH and a file-existence
 *   check; passing them in keeps the resolver pure, so "a `.cmd` shim is refused on
 *   Windows" is a unit test that runs on any host.
 *
 * Exports: ResolveBinaryOptions.
 * Depends on: nothing. Types only.
 */

export interface ResolveBinaryOptions {
  readonly platform: NodeJS.Platform;
  /** PATH value of the host (Windows: `Path` or `PATH`). */
  readonly pathVar: string | undefined;
  readonly exists: (path: string) => boolean;
}
