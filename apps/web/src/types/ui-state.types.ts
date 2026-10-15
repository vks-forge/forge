/**
 * Shapes of the UI preferences and drafts kept in `src/state/`.
 *
 * Why: these are the preferences and drafts that persist across reloads (d-0122). Naming each
 *   store's shape once lets the schemas that guard storage and the hooks that read it agree
 *   on exactly what is saved.
 *
 * Exports: BoardPrefs, ThreadPrefs, ThemePrefs, ProjectPrefs, AnswerDrafts, MemoryPrefs,
 *   AuthorPrefs, WelcomePrefs.
 * Depends on: types/board.types, types/memory.types, types/nav.types. Types only.
 */

import type { BoardFilter } from '#/types/board.types.js';
import type { MemoryTab } from '#/types/memory.types.js';
import type { ThemeMode } from '#/types/nav.types.js';

export interface BoardPrefs {
  /** Cards arrive in W6; until then only `tickets` can be chosen. */
  readonly view: 'tickets' | 'cards';
  readonly filter: BoardFilter;
}

export interface ThreadPrefs {
  /** Scroll with the newest line while the user is at the bottom. */
  readonly followLatest: boolean;
  /** Open every tool call instead of collapsing it to one line. */
  readonly expandTools: boolean;
}

export interface ThemePrefs {
  readonly mode: ThemeMode;
}

/** The project the user last worked in; a slug, never project data. */
export interface ProjectPrefs {
  readonly slug: string | null;
}

/** Unsent answer text by question id; cleared when the answer is sent. */
export interface AnswerDrafts {
  readonly drafts: Readonly<Record<string, string>>;
}

/** Memory screen choices that outlive a reload; the search text is deliberately not kept. */
export interface MemoryPrefs {
  /** `null` until the user picks a tab, so the screen can open on Proposals when answers wait. */
  readonly chosen: {
    readonly tab: MemoryTab;
    readonly tags: readonly string[];
    readonly activeOnly: boolean;
  } | null;
}

/** Where the first-run wizard was and whether "Finish later" was chosen; no server data. */
export interface WelcomePrefs {
  readonly step: 'data' | 'harness' | 'github' | 'project' | null;
  readonly dismissed: boolean;
}

/** The name recorded on settings saves; a label for the audit trail, not an identity. */
export interface AuthorPrefs {
  readonly author: string;
}
