/**
 * Registry of the Forge tools.
 *
 * Why: the server, the catalogue hash computation and the docs all need the same list
 *   of tools. One array means a tool added here is served, hashed and checked against
 *   the signed catalogue together, and cannot be served without being reviewed there.
 *
 * Exports: FORGE_TOOLS.
 * Depends on: domain/tools/*. No IO.
 */

import { addCommentTool } from '#/domain/tools/add-comment.js';
import { askDirectorTool, reportBlockedTool } from '#/domain/tools/ask-director.js';
import { docsLookupTool } from '#/domain/tools/docs-lookup.js';
import { finishTool } from '#/domain/tools/finish.js';
import { getTicketTool } from '#/domain/tools/get-ticket.js';
import { webFetchTool } from '#/domain/tools/web-fetch.js';
import { webSearchTool } from '#/domain/tools/web-search.js';
import type { ForgeToolSpec } from '#/types/tool-spec.types.js';

export const FORGE_TOOLS: readonly ForgeToolSpec[] = [
  getTicketTool,
  addCommentTool,
  askDirectorTool,
  reportBlockedTool,
  finishTool,
  webSearchTool,
  docsLookupTool,
  webFetchTool,
];
