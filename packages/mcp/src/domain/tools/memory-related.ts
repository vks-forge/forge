/**
 * Tool `memory_related` — the records linked to or similar to one project memory record.
 *
 * Why: after reading a decision a Worker may need what amends it, replaced it or shares its tags. The
 *   question is only answered for a record this run may already see: an unknown record and an out-of-scope
 *   one give the same `not_found`, and the index drops every neighbour outside the scope, so a link into a
 *   pending proposal never shows. The answer is cut to 1,200 characters and opens with the notice that the
 *   text is recorded data, not instructions (d-0067, d-0168).
 *
 * Exports: memoryRelatedTool, MEMORY_RELATED_MAX_CHARS.
 * Depends on: @forge/core, schemas/tool-inputs, shared/define-tool, shared/memory-access. IO: the memory index via deps.
 */

import { MEMORY_NOTICE } from '@forge/core';
import { MemoryRelatedInput } from '#/schemas/tool-inputs.js';
import { defineTool } from '#/shared/define-tool.js';
import { capList, notFound, placeRun } from '#/shared/memory-access.js';

export const MEMORY_RELATED_MAX_CHARS = 1_200;
const DEFAULT_K = 5;

export const memoryRelatedTool = defineTool({
  name: 'memory_related',
  description:
    'List up to five records related to one project memory record (amends, replaced by, shared tags, similar text).',
  risk: 'read',
  strict: true,
  inputSchema: MemoryRelatedInput,
  async handler(ctx, { id, k }) {
    const { memory, project, opts } = await placeRun(ctx, 'memory_related');
    const found = await memory.related(project, id, k ?? DEFAULT_K, opts);
    if (found === null) {
      throw notFound(`no memory record ${id} visible to this run`);
    }

    const render = (kept: readonly (typeof found)[number][]): string =>
      JSON.stringify({ notice: MEMORY_NOTICE, related: kept });

    return render(capList(found, MEMORY_RELATED_MAX_CHARS, render).kept);
  },
});
