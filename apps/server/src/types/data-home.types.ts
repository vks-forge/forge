/**
 * Types for locating the data home on the machine.
 *
 * Why: resolving the data home needs two facts the pure resolver in `@forge/core` does not
 *   read itself: the platform and the user's home directory. Naming them as one small port
 *   lets tests supply a literal machine instead of touching the real `%LOCALAPPDATA%`.
 *
 * Exports: DataHomeIo.
 * Depends on: none. Types only.
 */

export interface DataHomeIo {
  readonly platform: string;
  readonly homedir: string;
}
