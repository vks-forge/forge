/**
 * Shapes shared by the folder browser's parts.
 *
 * Why: the list reports where a folder's menu should open and the menu draws it there; naming
 *   that target once keeps the two in step.
 *
 * Exports: FolderMenuTarget.
 * Depends on: @forge/core (FolderEntry, type). Types only.
 */

import type { FolderEntry } from '@forge/core';

/** The folder a context menu is for, and the screen position it opens at. */
export interface FolderMenuTarget {
  readonly entry: FolderEntry;
  readonly x: number;
  readonly y: number;
}
