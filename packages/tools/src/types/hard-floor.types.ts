/**
 * Types for the hard floor list.
 *
 * Why: bypass mode (d-0183) lets a Worker run without asking, so the few things it must still
 * never do are named in one list; each entry says what it protects so a reader and the tests can
 * see the floor covers secrets, Forge's data folder, outside paths, publishing and deletes.
 *
 * Exports: HardFloorArea.
 * Depends on: nothing. Types only.
 */

/** What a hard-floor rule protects. */
export type HardFloorArea =
  'data-home' | 'secrets' | 'outside-worktree' | 'publish' | 'destructive' | 'policy';
