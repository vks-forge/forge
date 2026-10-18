/**
 * Pins: the web's plan ticket keeps the Director's pipeline ops (an unknown key would be stripped
 * silently, hiding the change the owner is approving) while every stored plan without them still
 * parses; the stand-in Director settings carry the new step's model and timeout and the suggestion
 * thresholds, so a server that predates them still opens the Director page; and the reply schemas of
 * proposals and marks refuse a malformed answer.
 *
 * Why: the plan and the Director page are where the owner approves what the Director may do. A schema
 * that drops a field renders a lighter pipeline as no change at all, and a settings page that cannot open
 * on an older server takes the owner's control away.
 * Depends on: schemas/plan, schemas/director-config, schemas/pipeline-proposals, schemas/pipelines,
 * domain/director-defaults.
 */

import { describe, expect, it } from 'vitest';
import { FALLBACK_DIRECTOR, FALLBACK_STEP_MODELS } from '#/domain/director-defaults.js';
import {
  CompanyConfigReply,
  DirectorConfig,
  STEP_NAMES,
} from '#/schemas/director-config.js';
import { MarkFindingReply } from '#/schemas/pipelines.js';
import { ProposalsReply } from '#/schemas/pipeline-proposals.js';
import { PlanTicket } from '#/schemas/plan.js';
import { BUILTIN_FORGE_WITH_DIRECTOR } from '#tests/helpers/forge-data/director-data.js';
import { addReviewerProposal } from '#tests/helpers/forge-data/proposal-data.js';
import { ticketPipeline } from '#tests/helpers/forge-data/pipeline-data.js';

describe('PlanTicket.pipeline', () => {
  const op = {
    op: 'remove',
    stage_id: 'reviewer',
    reason: 'A reason of ten characters.',
  };

  it('keeps the Director’s ops', () => {
    const ticket = PlanTicket.parse({ key: 't1', title: 'One', pipeline: { ops: [op] } });

    expect(ticket.pipeline?.ops).toEqual([op]);
  });

  it('still parses a plan ticket with no pipeline', () => {
    expect(PlanTicket.parse({ key: 't1', title: 'One' }).pipeline).toBeUndefined();
  });

  it('refuses an op with no reason', () => {
    expect(
      PlanTicket.safeParse({
        key: 't1',
        title: 'One',
        pipeline: { ops: [{ op: 'remove', stage_id: 'reviewer' }] },
      }).success,
    ).toBe(false);
  });
});

describe('Director stand-ins', () => {
  it('model and time the substitute step, and carry the suggestion defaults', () => {
    expect(FALLBACK_STEP_MODELS.pick_substitute).toBe('sonnet');
    expect(FALLBACK_DIRECTOR.step_timeouts_ms.pick_substitute).toBe(120_000);
    expect(FALLBACK_DIRECTOR.pipelines).toEqual({
      adjust: true,
      propose_after: 3,
      propose_min_cards: 2,
      propose_window_days: 30,
    });

    expect(DirectorConfig.safeParse(FALLBACK_DIRECTOR).success).toBe(true);
  });

  it('covers every step core knows, so no step lacks a model or a timeout', () => {
    for (const step of STEP_NAMES) {
      expect(FALLBACK_DIRECTOR.step_timeouts_ms[step]).toBeGreaterThan(0);
    }
  });

  it('fills the substitute model for a server that sends none', () => {
    const older = Object.fromEntries(
      Object.entries(BUILTIN_FORGE_WITH_DIRECTOR.models.director).filter(
        ([step]) => step !== 'pick_substitute',
      ),
    );

    const parsed = CompanyConfigReply.parse({
      config: {
        ...BUILTIN_FORGE_WITH_DIRECTOR,
        models: { ...BUILTIN_FORGE_WITH_DIRECTOR.models, director: older },
      },
      version: 1,
    });

    expect(parsed.config.models.director.pick_substitute).toBe('sonnet');
  });
});

describe('reply schemas', () => {
  it('reads the pending proposals', () => {
    expect(
      ProposalsReply.parse({ proposals: [addReviewerProposal()] }).proposals,
    ).toHaveLength(1);
  });

  it('refuses a proposal with no evidence', () => {
    expect(
      ProposalsReply.safeParse({
        proposals: [{ ...addReviewerProposal(), evidence: [] }],
      }).success,
    ).toBe(false);
  });

  it('reads the strip a mark answers with, and refuses a missing one', () => {
    expect(MarkFindingReply.parse({ pipeline: ticketPipeline([]) }).pipeline.lane).toBe(
      'standard',
    );

    expect(MarkFindingReply.safeParse({}).success).toBe(false);
  });
});
