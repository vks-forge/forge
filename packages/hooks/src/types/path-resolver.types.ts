/**
 * Types of the physical path view of a tool call.
 *
 * Why: the hook handler judges a path tool call twice, once as spelled and once as the
 *   filesystem resolves it. The resolver answers with one of three outcomes, and the handler
 *   must handle each: nothing to resolve, a physical twin of the call to judge, or a path it
 *   could not resolve safely (which is refused, not guessed).
 *
 * Exports: PhysicalView.
 * Depends on: @forge/tools (AdmitCall, AdmitContext). Types only.
 */

import type { AdmitCall, AdmitContext } from '@forge/tools';

/** The call as the filesystem sees it, or `refuse` when a path could not be resolved safely. */
export type PhysicalView =
  | { readonly kind: 'none' }
  | { readonly kind: 'refuse' }
  | { readonly kind: 'view'; readonly ctx: AdmitContext; readonly call: AdmitCall };
