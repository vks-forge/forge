/**
 * Shapes of the system folder window: the port routes use and the parts behind it.
 *
 * Why: choosing a folder opens a real window on the person's desktop (Explorer, Finder,
 *   zenity), which no test may do and which differs on every OS. Routes depend on one small
 *   port; each OS implements it by running a program, and that run is itself a seam so the
 *   parsing of what the program printed can be tested without any window.
 *
 * Exports: FolderPicker, FolderRevealer, PlatformPicker, CommandRunner, CommandResult.
 * Depends on: @forge/core (FolderPick). Types only.
 */

import type { FolderPick, FolderReveal } from '@forge/core';

/** Opens the system folder window and answers what the person did in it. */
export interface FolderPicker {
  /** `start` is a folder to open in; ignored unless it is absolute and exists. Rejects with 409 `picker_busy` when a window is already open. */
  pick(start?: string): Promise<FolderPick>;
}

/** Shows an existing folder in the OS file manager. */
export interface FolderRevealer {
  /** `path` must be an absolute existing folder; anything else is refused with a 4xx `HttpError`. */
  reveal(path: string): Promise<FolderReveal>;
}

/** What a finished child program left behind. */
export interface CommandResult {
  /** Exit code; null when the program was killed (timeout) or never started. */
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** The program does not exist on this machine (ENOENT). */
  readonly missing: boolean;
  /** The program ran past its time limit and was killed. */
  readonly timedOut: boolean;
}

/** Runs one program with fixed arguments and no shell; `env` is added to the process environment. */
export type CommandRunner = (
  file: string,
  args: readonly string[],
  env?: Readonly<Record<string, string>>,
) => Promise<CommandResult>;

/** One OS's way to show the folder window; `start` is already checked. */
export type PlatformPicker = (
  run: CommandRunner,
  start: string | undefined,
  env: NodeJS.ProcessEnv,
) => Promise<FolderPick>;
