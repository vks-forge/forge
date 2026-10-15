/**
 * Who the owner is, as far as the server's audit trail is concerned.
 *
 * Why: settings saves and memory answers must name an author, and the history says who made
 *   each change. Forge is a single-owner tool today and has no login, so the control room
 *   signs what the owner does as `owner`. When accounts exist this is the one place that
 *   changes.
 *
 * Exports: OWNER.
 * Depends on: nothing. No IO.
 */

export const OWNER = 'owner';
