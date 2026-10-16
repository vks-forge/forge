/**
 * Shapes of the folder browser API: `GET /fs/folders` and `POST /fs/pick-folder`.
 *
 * Why: a browser page never learns an absolute path from a file picker, yet a project is
 *   registered by the absolute path of its clone. The server (which runs on the same machine as
 *   the person) lists folders for the page to browse, and one definition here means the server
 *   that builds the listing and the web dialog that reads it cannot drift. The listing holds
 *   folder names only, never file names or contents.
 *
 * Exports: FolderEntry, FolderListing, FolderPickBody, FolderPick, FolderCreateBody, FolderRevealBody,
 *   FolderReveal.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

/**
 * One sub-folder: its name, absolute path, whether it has a `.git` entry (a clone's top folder),
 * and when it last changed (ISO) so the browser can sort by date; null for drives and unreadable folders.
 */
export const FolderEntry = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  is_repo: z.boolean(),
  modified_at: z.string().nullable().default(null),
});
export type FolderEntry = z.infer<typeof FolderEntry>;

/**
 * The sub-folders of `path`. An empty `path` with a null `parent` is the roots view (drives and
 * the home folder); a non-empty `path` with a null `parent` is a drive or `/` root, whose "up" is
 * the roots view.
 */
export const FolderListing = z.object({
  path: z.string(),
  parent: z.string().nullable(),
  entries: z.array(FolderEntry),
  /** True when the folder holds more sub-folders than the listing shows. */
  truncated: z.boolean(),
});
export type FolderListing = z.infer<typeof FolderListing>;

/** `POST /fs/pick-folder` body: the folder the window should open in, when the person typed one. */
export const FolderPickBody = z.object({ start: z.string().optional() }).strict();
export type FolderPickBody = z.infer<typeof FolderPickBody>;

/**
 * What the system folder window answered. `unavailable` (no desktop, no dialog program) is a
 * normal answer, not an error, so the page falls back to the in-app browser.
 */
export const FolderPick = z.discriminatedUnion('status', [
  z.object({ status: z.literal('picked'), path: z.string().min(1) }),
  z.object({ status: z.literal('cancelled') }),
  z.object({ status: z.literal('unavailable'), reason: z.string() }),
]);
export type FolderPick = z.infer<typeof FolderPick>;

/** `POST /fs/folders` body: make one folder called `name` inside the absolute folder `parent`. */
export const FolderCreateBody = z
  .object({ parent: z.string().min(1), name: z.string().min(1) })
  .strict();
export type FolderCreateBody = z.infer<typeof FolderCreateBody>;

/** `POST /fs/reveal` body: the absolute folder to show in the file manager. */
export const FolderRevealBody = z.object({ path: z.string().min(1) }).strict();
export type FolderRevealBody = z.infer<typeof FolderRevealBody>;

/** `opened`, or `unavailable` (no desktop, no file manager) which the page words as a note. */
export const FolderReveal = z.discriminatedUnion('status', [
  z.object({ status: z.literal('opened') }),
  z.object({ status: z.literal('unavailable'), reason: z.string() }),
]);
export type FolderReveal = z.infer<typeof FolderReveal>;
