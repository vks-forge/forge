/**
 * Sign-off stage: the Director signs low-risk work that passed everything, else the owner does.
 *
 * Why: the routine "looks fine, merge it" click is the Director's to take (d-0137) only when nothing
 *   is in doubt, and a tier C change is the Director's only on a clean floor (d-0181). The call is
 *   `signOffDecision`, deterministic and with no second model step that could be talked into agreeing:
 *   it reads the tier of the real diff, the Director's own ceiling from its settings, whether every
 *   check of this round passed outright, whether the Director check passed, and whether the owner
 *   overruled anything. When the Director signs, the stage records a `director` row (who signed and
 *   why) and the merge door finishes the job: tier A merges as always, tier B goes through the owner's
 *   door with the signer `director` and leaves a card note with the reasons. Otherwise the stage
 *   hands the ticket to the merge door to wait for the owner, with the reason the Director declined,
 *   which the owner reads on the sign-off card. Tier C is signed here only on a clean floor (d-0181:
 *   no critical or high finding, no secrets path, not Always ask) and otherwise names the one
 *   failing condition; the merge door and the state machine re-check it.
 *
 * Exports: signOff(), directorSignature(), directorSignedTier().
 * Depends on: @forge/core (signOffDecision, StageRun, Tier), domain/sign-off-facts, tick/{planning-state,stage-records,
 *   verify-merge-steps}, types/stage-runner. IO: the git diff, storage.
 */

import { signOffDecision } from '@forge/core';
import type { SignOffStage, StageRun, Tier } from '@forge/core';
import { signOffFacts } from '#/domain/sign-off-facts.js';
import { directorFor } from '#/tick/planning-state.js';
import { recordStage } from '#/tick/stage-records.js';
import { secretPathOfDiff, tierOfDiff } from '#/tick/verify-merge-steps.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { StageState, VerifyHooks } from '#/types/stage-runner.types.js';
import type { VerifyTarget } from '#/types/verify.types.js';

/** The passed sign-off row the Director signed, if the pipeline's sign-off stage holds one. */
function directorRow(state: StageState): StageRun | undefined {
  const stage = state.snapshot.definition.stages.find((s) => s.kind === 'sign_off');

  return stage
    ? state.records.find(
        (r) =>
          r.stage_id === stage.id &&
          r.kind === 'director' &&
          r.status === 'passed' &&
          r.outcome.signed_by === 'director',
      )
    : undefined;
}

/** The Director's reasons when the pipeline's sign-off stage holds a passed row it signed, else null. */
export function directorSignature(state: StageState): string | null {
  const row = directorRow(state);

  return row ? (row.outcome.sign_reason ?? 'every check passed') : null;
}

/** The tier the Director's row says it signed; the merge door lets tier C through only on `C`. */
export function directorSignedTier(state: StageState): Tier | undefined {
  return directorRow(state)?.outcome.signed_tier;
}

/**
 * Decides who signs and acts on it. `signed` means the Director's row is written and the caller
 * asks the cursor again (it now says merge); `handled` means the ticket was handed to the merge
 * door to wait for the owner.
 */
export async function signOff(
  ctx: EngineCtx,
  t: VerifyTarget,
  state: StageState,
  stage: SignOffStage,
  hooks: VerifyHooks,
): Promise<'signed' | 'handled'> {
  const tier = await tierOfDiff(ctx, t);
  const facts = signOffFacts(state.snapshot, state.records, state.cycle);
  const { director } = directorFor(ctx, t.project.slug);
  const decision = signOffDecision({
    signer: stage.signer,
    tier,
    maxTier: director.sign_off.max_tier,
    checksPassed: facts.checksPassed,
    checkPassed: facts.checkPassed,
    overrides: facts.overrides,
    stepError: false,
    openSevere: facts.counts.critical + facts.counts.high,
    // The diff is only read for tier C: no other tier's rule looks at secrets paths.
    secretsPath: tier === 'C' ? await secretPathOfDiff(t) : null,
    approvalMode: director.approval_mode,
  });

  if (decision.by === 'director') {
    await ctx.deps.storage.transaction((tx) =>
      recordStage(
        tx,
        ctx.nowIso,
        {
          ticket_id: t.ticket.id,
          stage_id: stage.id,
          member_id: '',
          cycle: state.cycle,
          kind: 'director',
        },
        'passed',
        {
          signed_by: 'director',
          sign_reason: decision.reason.slice(0, 500),
          signed_tier: tier,
        },
      ),
    );

    return 'signed';
  }

  // A sign-off set to always need the owner never went to the Director, so nothing was declined.
  await hooks.merge(ctx, t, await hooks.rows(ctx, t), {
    hold: true,
    ...(stage.signer === 'owner' ? {} : { declined: decision.reason }),
  });

  return 'handled';
}
