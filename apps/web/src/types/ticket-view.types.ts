/**
 * Small display shapes shared by the Board and the Ticket page.
 *
 * Why: run status and its tone are shown on cards, in the runs list and in the thread header;
 *   one definition keeps a failed run looking the same everywhere.
 *
 * Exports: RunTone.
 * Depends on: nothing. Types only.
 */

/** `live`: a Worker may still be producing events; `bad`: something went wrong; `quiet`: neutral. */
export type RunTone = 'live' | 'good' | 'bad' | 'quiet';
