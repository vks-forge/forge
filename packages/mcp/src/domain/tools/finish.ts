/**
 * Tool `finish` — the Worker's final summary and typed claims.
 *
 * Why: the G1 gate compares what a Worker says it did with the tool receipts. Free
 *   prose cannot be checked, so `finish` takes a summary plus claims from a closed
 *   vocabulary (ran_tests, edited, added_test, read) and stores both on the run's
 *   `finish` event. Only one finish per run is accepted, so a later call cannot rewrite
 *   what was claimed after verification started (verification-plane.md §2).
 *
 * Exports: finishTool.
 * Depends on: @forge/core, domain/run-log, shared/define-tool, schemas/tool-inputs. IO: storage write.
 */

import { PolicyDeniedError } from '@forge/core';
import { appendRunEvent } from '#/domain/run-log.js';
import { FinishInput } from '#/schemas/tool-inputs.js';
import { defineTool } from '#/shared/define-tool.js';

export const finishTool = defineTool({
  name: 'finish',
  description:
    'Declare the work finished. Give a short summary and list what you did as claims: {kind:"ran_tests"}, {kind:"edited",path}, {kind:"added_test",name}, {kind:"read",path}. Claims are checked against tool records.',
  risk: 'write-cwd',
  inputSchema: FinishInput,
  async handler(ctx, { summary, claims }) {
    await ctx.deps.storage.transaction(async (tx) => {
      const events = await tx.runEvents.listByRun(ctx.run.id);
      if (events.some((e) => e.type === 'finish'))
        throw new PolicyDeniedError('this run has already called finish');
      await appendRunEvent(tx, ctx, (ts) => ({
        type: 'finish',
        ts,
        summary,
        structured: { claims },
      }));
    });
    return JSON.stringify({ recorded: true, claims: claims.length });
  },
});
