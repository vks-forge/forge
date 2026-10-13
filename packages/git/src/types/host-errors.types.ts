/**
 * Type of the reasons a GitHost operation can fail.
 *
 * Why: the engine branches on the error family, but logs and tests need the finer cause
 *   (a merge the host refused versus a missing PR). One closed union keeps adapters from
 *   inventing ad-hoc reason strings.
 *
 * Exports: GitHostReason.
 * Depends on: none. Types only.
 */

export type GitHostReason =
  'auth' | 'rate_limit' | 'not_found' | 'merge_refused' | 'invalid' | 'unavailable';
