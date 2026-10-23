/**
 * Approved rules — the checks every owner-approved "always" rule must pass.
 *
 * Why: "Always for this project" turns one owner click into a standing permission, so it must
 *   stay as narrow as the call the owner saw. A rule that is a shell wildcard, names an
 *   interpreter, or covers a protected path would let one approval permit anything later
 *   (tool-system.md §13). The same check runs when settings are saved (the owner's request is
 *   refused) and again inside `admit()` (a rule that slipped into storage is ignored), so a
 *   bad row can never become consent.
 *
 * Exports: approvedRuleProblem(), approvedAsRules(), usableApproved(), protectedPathHit().
 * Depends on: @forge/core (globMatch), domain/call-resource, domain/command-classes, domain/floors,
 *   schemas/grant, types/grants. No IO.
 */

import { globMatch } from '@forge/core';
import { PATH_TOOLS } from '#/domain/call-resource.js';
import { isBannedAllowResource } from '#/domain/command-classes.js';
import { PROTECTED_PATHS } from '#/domain/floors.js';
import type { ApprovedRule, CallRule } from '#/schemas/grant.js';
import type { EffectiveGrant } from '#/types/grants.types.js';

/** True when the (lowercased) path matches any protected-path pattern. */
export function protectedPathHit(path: string): boolean {
  return PROTECTED_PATHS.some((p) => globMatch(p, path, true));
}

/** Both directions: the rule resource may be a glob that covers a protected pattern, or a name one covers. */
function coversProtected(resource: string): boolean {
  return (
    protectedPathHit(resource) ||
    PROTECTED_PATHS.some((p) => globMatch(resource, p, true))
  );
}

/** Why an approved rule is not acceptable, or `null` when it is. */
export function approvedRuleProblem(
  rule: Pick<CallRule, 'action' | 'resource' | 'effect' | 'strict'>,
): string | null {
  if (rule.effect !== 'allow') {
    return 'only allow';
  }

  if (rule.strict !== undefined) {
    return 'strict is lane-only';
  }

  if (rule.resource.trim() === '' || /[\r\n]/.test(rule.resource)) {
    return 'empty or multi-line resource';
  }

  if (rule.action === 'shell') {
    if (/[*?]/.test(rule.resource)) {
      return 'no wildcard in a shell rule';
    }

    return isBannedAllowResource(rule.resource) ? 'banned always-allow command' : null;
  }

  return PATH_TOOLS.has(rule.action) && coversProtected(rule.resource)
    ? 'covers a protected path'
    : null;
}

/** Stored approvals as allow rules whose id is the provenance shown in receipts. */
export function approvedAsRules(approved: readonly ApprovedRule[]): CallRule[] {
  return approved.map((r) => ({
    id: `project:approved#${r.id}`,
    action: r.action,
    resource: r.resource,
    effect: 'allow',
  }));
}

/** The grant's approved rules that still pass validation (defence in depth at call time). */
export function usableApproved(grant: EffectiveGrant): CallRule[] {
  return grant.approved.filter((r) => approvedRuleProblem(r) === null);
}
