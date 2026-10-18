/**
 * Tool `memory_get` — read up to three project memory records in full.
 *
 * Why: after a search a Worker may need the whole record, including the reasoning in its body. The ids are
 *   looked up inside the scope the server built for this run, so a pending proposal, an outcome, a
 *   superseded decision, another project's record and an id that does not exist all give the same
 *   `not_found`: asking by id reveals nothing. Each record carries who wrote it and where it came from
 *   (`author`, `origin`) so the Worker can weigh it, and statement plus body are cut to 4,000 characters so
 *   one record cannot flood the context (d-0067, d-0168).
 *
 * Exports: memoryGetTool, MEMORY_RECORD_MAX_CHARS.
 * Depends on: @forge/core, schemas/tool-inputs, shared/define-tool, shared/memory-access. IO: the memory index via deps.
 */

import { MEMORY_NOTICE } from '@forge/core';
import { MemoryGetInput } from '#/schemas/tool-inputs.js';
import { defineTool } from '#/shared/define-tool.js';
import { notFound, placeRun } from '#/shared/memory-access.js';

export const MEMORY_RECORD_MAX_CHARS = 4_000;

export const memoryGetTool = defineTool({
  name: 'memory_get',
  description:
    'Read up to three project memory records by id (such as d-0012), with who wrote each and where it came from.',
  risk: 'read',
  strict: true,
  inputSchema: MemoryGetInput,
  async handler(ctx, { ids }) {
    const { memory, project, opts } = await placeRun(ctx, 'memory_get');
    const { records, missing } = await memory.get(project, ids, opts);
    if (missing.length > 0 || records.length === 0) {
      throw notFound(`no memory record ${missing.join(', ')} visible to this run`);
    }

    return JSON.stringify({
      notice: MEMORY_NOTICE,
      records: records.map((r) => {
        const room = Math.max(0, MEMORY_RECORD_MAX_CHARS - r.statement.length);

        return {
          id: r.id,
          kind: r.kind,
          statement: r.statement,
          body: r.body.slice(0, room),
          body_truncated: r.body_truncated || r.body.length > room,
          tags: r.tags,
          valid_from: r.valid_from,
          author: r.author,
          origin: r.origin,
        };
      }),
    });
  },
});
