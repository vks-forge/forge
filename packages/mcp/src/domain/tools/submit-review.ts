/**
 * Tool `submit_review` — a check agent's typed review of the ticket's change.
 *
 * Why: a reviewer's judgement has to reach the engine as data it can act on, not as prose it
 *   would have to interpret. The review is a verdict, a summary and findings with severity,
 *   place and evidence (d-0071); a finding with no evidence is refused here, so an unsupported
 *   accusation can never send work back. It is stored as a `review` event on the run's log, which
 *   the stage runner reads when the run ends. The tool is read-class (it changes no files) and
 *   may be called again: the last call before the run ends is the one that counts.
 *
 * Exports: submitReviewTool.
 * Depends on: @forge/core (ReviewSubmission, InvalidInputError), domain/run-log, shared/define-tool,
 *   schemas/tool-inputs. IO: storage write.
 */

import { InvalidInputError, ReviewSubmission } from '@forge/core';
import { appendRunEvent } from '#/domain/run-log.js';
import { SubmitReviewInput } from '#/schemas/tool-inputs.js';
import { defineTool } from '#/shared/define-tool.js';

export const submitReviewTool = defineTool({
  name: 'submit_review',
  description:
    'Report your review of the change: {verdict:"pass"|"changes", summary, findings:[{severity:"critical"|"high"|"medium"|"low", file?, line?, issue, evidence}]}. Every finding needs evidence. Calling it again replaces your earlier call until the run ends.',
  risk: 'read',
  inputSchema: SubmitReviewInput,
  async handler(ctx, args) {
    const parsed = ReviewSubmission.safeParse(args);
    if (!parsed.success) {
      throw new InvalidInputError(
        `invalid review: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      );
    }

    const review = parsed.data;
    await ctx.deps.storage.transaction((tx) =>
      appendRunEvent(tx, ctx, (ts) => ({ type: 'review', ts, review })),
    );

    return JSON.stringify({ recorded: true, findings: review.findings.length });
  },
});
