/**
 * Sign-off decision — who signs finished work: the Director, or the owner.
 *
 * Why: the Director may take the routine click off the owner (d-0137) only when nothing is in
 *   doubt. Tier C (auth, migrations, secrets, billing) is the Director's only on a clean floor
 *   (d-0181): all of the above plus no critical or high finding open, no secrets path in the diff
 *   and the owner's Always ask setting off; otherwise the owner signs and reads the one condition
 *   that failed. The call is pure and deterministic, with no second model step that could be talked
 *   into agreeing, and it fails closed: an unknown signer, tier or ceiling, a check that did not
 *   plainly pass (failed, skipped, errored), an owner override anywhere in the ticket's cycle, or
 *   a step that errored all leave the signature with the owner. The reason travels to the owner's
 *   sign-off card so they can read why the Director did not sign.
 *
 * Exports: signOffDecision().
 * Depends on: types/sign-off. No IO.
 */

import type { SignOffDecision, SignOffInput } from '#/types/sign-off.types.js';

const TIERS: Readonly<Record<string, number>> = { A: 1, B: 2, C: 3 };
const CEILINGS: Readonly<Record<string, number>> = { none: 0, A: 1, B: 2 };

const owner = (reason: string): SignOffDecision => ({ by: 'owner', reason });

/** The extra conditions of tier C (d-0181): the specific one that fails, or null when clean. */
function tierCBlock(input: SignOffInput): string | null {
  if (input.approvalMode === 'always_ask') {
    return 'Tier C change, and your Director setting is Always ask, so it needs you.';
  }

  if (input.secretsPath !== null) {
    return `Tier C change touches a secrets path (${input.secretsPath}), so it needs you.`;
  }

  if (input.openSevere > 0) {
    return `Tier C change has ${input.openSevere} open critical or high finding(s), so it needs you.`;
  }

  return null;
}

/** Who signs and why. Anything it does not recognise goes to the owner. */
export function signOffDecision(input: SignOffInput): SignOffDecision {
  if (input.signer === 'owner') {
    return owner('This sign-off is set to always need you.');
  }

  if (input.signer !== 'director_or_owner') {
    return owner('The sign-off setting is not recognised, so it needs you.');
  }

  const tier = TIERS[input.tier];
  const ceiling = CEILINGS[input.maxTier];
  if (tier === undefined || ceiling === undefined) {
    return owner(
      'The change tier or the Director ceiling is not recognised, so it needs you.',
    );
  }

  // Tier C is not a ceiling value: any signing ceiling (A or B) lets the Director take a clean one.
  if (ceiling === 0 || (input.tier !== 'C' && tier > ceiling)) {
    return owner(
      ceiling === 0
        ? 'The Director is set never to sign off, so it needs you.'
        : `Tier ${input.tier} is above the Director's ceiling (tier ${input.maxTier}).`,
    );
  }

  if (input.stepError) {
    return owner('The Director check could not finish, so the Director does not sign.');
  }

  if (!input.checksPassed) {
    return owner('A check did not pass cleanly in this round, so it needs you.');
  }

  if (!input.checkPassed) {
    return owner(
      'The Director check against the plan did not pass cleanly, so it needs you.',
    );
  }

  if (input.overrides > 0) {
    return owner('You overruled a stage earlier, so the final sign-off is yours.');
  }

  if (input.tier === 'C') {
    const why = tierCBlock(input);
    if (why !== null) {
      return owner(why);
    }

    return {
      by: 'director',
      reason:
        'Tier C; every check passed, 0 critical/high findings, the plan check passed and no secrets path is touched.',
    };
  }

  return {
    by: 'director',
    reason: `Tier ${input.tier}; every check passed and the change matches the plan.`,
  };
}
