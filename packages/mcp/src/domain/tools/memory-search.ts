/**
 * Tool `memory_search` — find the project's recorded decisions and rejected approaches by keyword.
 *
 * Why: a Worker must not contradict what the owner decided or ruled out, but it cannot be handed the whole
 *   memory in every prompt. This is how it asks: keywords in, a short list of one-line hits out. The tool
 *   takes no project, status or scope: the server places the run (its project and its agent's memory slice)
 *   and the index applies that scope inside the query, so a Worker can only ever narrow what it sees. Hits
 *   are cut to 2,500 characters with `truncated` and `total` set, and the answer opens with the notice that
 *   the text is recorded data, not instructions (d-0067, d-0168).
 *
 * Exports: memorySearchTool, MEMORY_SEARCH_MAX_CHARS.
 * Depends on: @forge/core, schemas/tool-inputs, shared/define-tool, shared/memory-access. IO: the memory index via deps.
 */

import { MEMORY_NOTICE } from '@forge/core';
import { MemorySearchInput } from '#/schemas/tool-inputs.js';
import { defineTool } from '#/shared/define-tool.js';
import { capList, placeRun } from '#/shared/memory-access.js';

export const MEMORY_SEARCH_MAX_CHARS = 2_500;
const DEFAULT_K = 8;

export const memorySearchTool = defineTool({
  name: 'memory_search',
  description:
    'Search the project memory (decisions the owner made and approaches they rejected) by keywords; returns short hits, then read one with memory_get.',
  risk: 'read',
  strict: true,
  inputSchema: MemorySearchInput,
  async handler(ctx, { query, kinds, tags, k }) {
    const { memory, project, scope, opts } = await placeRun(ctx, 'memory_search');
    const reply = await memory.search({
      project,
      text: query,
      ...(kinds ? { kinds } : {}),
      ...(tags ? { tags } : {}),
      k: k ?? DEFAULT_K,
      scope,
      actor: 'worker',
      ...(opts.run_id ? { run_id: opts.run_id } : {}),
      ...(opts.ticket_id ? { ticket_id: opts.ticket_id } : {}),
    });

    const hits = reply.hits.map((h) => ({
      id: h.id,
      kind: h.kind,
      line: h.line,
      tags: h.tags,
      why: h.why,
    }));

    const render = (kept: readonly (typeof hits)[number][], truncated: boolean): string =>
      JSON.stringify({
        notice: MEMORY_NOTICE,
        hits: kept,
        total: reply.total,
        truncated,
      });

    const { kept, dropped } = capList(hits, MEMORY_SEARCH_MAX_CHARS, (h) =>
      render(h, true),
    );

    return render(kept, reply.truncated || dropped);
  },
});
