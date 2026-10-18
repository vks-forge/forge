/**
 * Sign-off decision — who signs finished work: the Director, or the owner.
 *
 * Why: the Director may take the routine click off the owner (d-0137) only when nothing is in
 *   doubt, and tier C (auth, migrations, secrets, billing) is always a named person (d-0012, d-0141
 *   item 9). The call is pure and deterministic, with no second model step that could be talked
 *   into agreeing, and it fails closed: an unknown signer, tier or ceiling, a check that did not
 *   plainly pass (failed, skipped, errored), an owner override anywhere in the ticket's cycle, or
 *   a step that errored all leave the signature with the owner. The reason travels to the owner's
 *   sign-off card so they can read why the Director did not sign.
 *
 * Exports: signOffDecision().
 * Depends on: types/sign-off. No IO.
 */

import type { SignOffDecision, SignOffInput } from '#/types/sign-off.types.js';

const RANK: Readonly<Record<string, number>> = { none: 0, A: 1, B: 2 };

const owner = (reason: string): SignOffDecision => ({ by: 'owner', reason });

/** Who signs and why. Anything it does not recognise goes to the owner. */
export function signOffDecision(input: SignOffInput): SignOffDecision {
  if (input.signer === 'owner') {
    return owner('This sign-off is set to always need you.');
  }

  if (input.signer !== 'director_or_owner') {
    return owner('The sign-off setting is not recognised, so it needs you.');
  }

  if (input.tier === 'C') {
    return owner('Tier C changes (auth, migrations, secrets, billing) always need you.');
  }

  const tier = RANK[input.tier];
  const ceiling = RANK[input.maxTier];
  if (tier === undefined || ceiling === undefined) {
    return owner(
      'The change tier or the Director ceiling is not recognised, so it needs you.',
    );
  }

  if (tier > ceiling) {
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

  return {
    by: 'director',
    reason: `Tier ${input.tier}; every check passed and the change matches the plan.`,
  };
}
