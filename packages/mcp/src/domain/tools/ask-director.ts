/**
 * Tools `ask_director` and `report_blocked` — hand a question or a blocker to the Director.
 *
 * Why: a Worker must never sit stalled waiting on a human. Both tools write a pending
 *   `interactions` row plus an `ask` run event and return at once with the instruction
 *   to stop; the Director parks the ticket and resumes the run when answered
 *   (director-core.md §8). `report_blocked` is stored as a question tagged
 *   `subtype: blocked` because the interaction kinds are closed (question, plan_confirm,
 *   permission); the Director reads the tag to escalate the lane.
 *
 * Exports: askDirectorTool, reportBlockedTool.
 * Depends on: domain/run-log, shared/define-tool, schemas/tool-inputs. IO: storage write.
 */

import { raiseInteraction } from '#/domain/run-log.js';
import { AskDirectorInput, ReportBlockedInput } from '#/schemas/tool-inputs.js';
import { defineTool } from '#/shared/define-tool.js';

const STOP =
  'Recorded. Stop working: do not wait or poll, end your turn now. You will be resumed with the answer.';

export const askDirectorTool = defineTool({
  name: 'ask_director',
  description:
    'Ask the Director (and the human behind it) a question you cannot resolve from the ticket or docs. Returns an interaction id; stop working after calling it.',
  risk: 'write-cwd',
  inputSchema: AskDirectorInput,
  async handler(ctx, { question }) {
    const id = await raiseInteraction(
      ctx,
      { question, source: 'ask_director' },
      question,
    );
    return JSON.stringify({ interaction_id: id, status: 'pending', instruction: STOP });
  },
});

export const reportBlockedTool = defineTool({
  name: 'report_blocked',
  description:
    'Report that you cannot continue (missing access, contradictory requirements, broken environment). Stop working after calling it.',
  risk: 'write-cwd',
  inputSchema: ReportBlockedInput,
  async handler(ctx, { reason }) {
    const id = await raiseInteraction(
      ctx,
      { subtype: 'blocked', reason, source: 'report_blocked' },
      `BLOCKED: ${reason}`,
    );
    return JSON.stringify({ interaction_id: id, status: 'pending', instruction: STOP });
  },
});
