/**
 * Types for reading the data-home choice from the machine.
 *
 * Why: resolving the data home needs three facts the pure resolver in `@forge/core` does not
 *   read itself: the platform, the user's home directory, and the text of the bootstrap file
 *   if one exists. Naming them as one small port lets tests supply a literal machine instead
 *   of touching the real `%LOCALAPPDATA%` or the real user's config folder.
 *
 * Exports: DataHomeIo.
 * Depends on: none. Types only.
 */

export interface DataHomeIo {
  readonly platform: string;
  readonly homedir: string;
  /** Text of the file, or `undefined` when it does not exist; other read errors throw. */
  readText(path: string): Promise<string | undefined>;
}
