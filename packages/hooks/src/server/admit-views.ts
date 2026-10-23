/**
 * Judges a call twice, lexically and on disk, and keeps the stricter verdict.
 *
 * Why: the floors in `@forge/tools` are lexical, so a junction, a symlink or a short name can
 *   point a harmless-looking path at a protected one. The same `admit()` judges the call as
 *   written and as it resolves (server/path-resolver); either look denying denies. The view that
 *   produced the answer is returned with it, because an ask must be raised for the call as it
 *   really is: the owner is shown the physical path and the approval key is that path's, so an
 *   approval for one path can never cover a link to another (M8, d-0175).
 *
 * Exports: admitBothViews().
 * Depends on: @forge/tools (AdmitCall, AdmitContext, Decision types), server/path-resolver, types/approval-gate. No IO of its own.
 */

import type { AdmitCall, AdmitContext, Decision } from '@forge/tools';
import { physicalView } from '#/server/path-resolver.js';
import type { JudgedCall } from '#/types/approval-gate.types.js';

const SEVERITY = { allow: 0, ask: 1, deny: 2 } as const;

/** The stricter verdict of the lexical call and its physical twin; the lexical one on a tie. */
export function admitBothViews(
  admit: (ctx: AdmitContext, call: AdmitCall) => Decision,
  ctx: AdmitContext,
  call: AdmitCall,
): JudgedCall {
  const lexical = { decision: admit(ctx, call), ctx, call };
  const view = physicalView(ctx, call);
  if (view.kind === 'none') {
    return lexical;
  }

  // A path that cannot be resolved safely is judged as an empty path: `invalid_resource`.
  const used =
    view.kind === 'refuse'
      ? { ctx, call: { ...call, input: { ...call.input, file_path: '', path: '' } } }
      : { ctx: view.ctx, call: view.call };

  const physical = { decision: admit(used.ctx, used.call), ...used };

  return SEVERITY[physical.decision.decision] > SEVERITY[lexical.decision.decision]
    ? physical
    : lexical;
}
