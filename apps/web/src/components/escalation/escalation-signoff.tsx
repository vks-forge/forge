/**
 * EscalationSignOff: finished work waiting for the owner's name, with the tier and what stood
 * behind it.
 *
 * Why: merging is the one step Forge cannot take back, so the card leads with the Director's
 *   recommendation and its evidence ("Recommend: sign off. All checks passed (3), 0 critical/high,
 *   matches the plan", or the reason it would not), then the owner signs knowing how risky the
 *   change is (the tier, in words), what the checks said (how many passed, what they found, how
 *   many held findings the owner already overruled) and, when the Director looked first, why it
 *   left the signature to them ("Why the Director did not sign"). Tier C says outright that only
 *   the owner can sign it. The buttons are the shared action bar; tier C's dialog asks who signs.
 *
 * Exports: EscalationSignOff.
 * Depends on: domain/finished-work-copy (checks line and recommendation), types/escalation-ui.types.
 */

import {
  SIGN_OFF_WHY,
  TIER_WORDS,
  checksLine,
  signOffRecommendation,
} from '#/domain/finished-work-copy.js';
import type { SignOffPayload } from '#/types/escalation-ui.types.js';

export function EscalationSignOff(props: { signOff: SignOffPayload }) {
  const { signOff } = props;
  const recommendation = signOffRecommendation(signOff);

  return (
    <div className="grid min-w-0 gap-2">
      <p
        className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
          recommendation.verdict === 'sign_off'
            ? 'border-good text-fg'
            : 'border-attn bg-attn-soft text-fg'
        }`}
      >
        <span
          aria-hidden="true"
          className={`mt-1.5 size-2 shrink-0 rounded-full ${recommendation.verdict === 'sign_off' ? 'bg-good' : 'bg-attn'}`}
        />
        <span className="min-w-0 break-words">{recommendation.line}</span>
      </p>
      <p className="min-w-0 whitespace-pre-wrap break-words text-base">
        {signOff.summary}
      </p>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="rounded-md border border-attn bg-attn-soft px-1.5 py-0.5 text-xs font-medium">
          {TIER_WORDS[signOff.tier]}
        </span>
        <span className="text-muted">{SIGN_OFF_WHY[signOff.cause]}</span>
      </p>
      <p className="text-sm">{checksLine(signOff.checks)}</p>
      {signOff.director_note === undefined ? null : (
        <div className="grid gap-0.5 border-l-2 border-line pl-3 text-sm">
          <p className="font-medium">Why the Director did not sign</p>
          <p className="min-w-0 whitespace-pre-wrap break-words text-muted">
            {signOff.director_note}
          </p>
        </div>
      )}
    </div>
  );
}
