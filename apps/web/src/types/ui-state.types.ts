/**
 * Shapes of the small UI preferences kept in `src/state/`.
 *
 * Why: board and thread preferences are read by several components and will move to
 *   persisted stores (d-0122); naming their shape once keeps that swap behind the hooks.
 *
 * Exports: BoardPrefs, ThreadPrefs.
 * Depends on: types/board.types. Types only.
 */

import type { BoardFilter } from '#/types/board.types.js';

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
