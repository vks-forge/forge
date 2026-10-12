/**
 * Tool `add_comment` — leave a note on the run's ticket.
 *
 * Why: Workers discover things worth telling a human or the next run (a root cause, a
 *   decision). Comments are stored in the run's event log as a `text` event, which the
 *   control room already renders, so no new table is needed. A comment can only target
 *   the run's own ticket; otherwise one Worker could write into another ticket's story.
 *
 * Exports: addCommentTool.
 * Depends on: @forge/core, domain/run-log, shared/define-tool. IO: storage write.
 */

import { PolicyDeniedError } from '@forge/core';
import { appendRunEvent } from '#/domain/run-log.js';
import { AddCommentInput } from '#/schemas/tool-inputs.js';
import { defineTool } from '#/shared/define-tool.js';

export const addCommentTool = defineTool({
  name: 'add_comment',
  description:
    'Add a comment to your own ticket. It is recorded in the run log for humans.',
  risk: 'write-cwd',
  inputSchema: AddCommentInput,
  async handler(ctx, { ticket, text }) {
    if (ticket !== ctx.run.ticket_id)
      throw new PolicyDeniedError(
        `comments are limited to this run's ticket (${ctx.run.ticket_id})`,
      );
    const event = await ctx.deps.storage.transaction((tx) =>
      appendRunEvent(tx, ctx, (seq, ts) => ({
        type: 'text',
        seq,
        ts,
        text: `[comment on ${ticket}] ${text}`,
      })),
    );
    return `comment recorded (seq ${event.seq})`;
  },
});
