/**
 * The tools an agent may be given, as a checklist the owner can read.
 *
 * Why: the tool catalogue is database data with ids such as `edit` or
 *   `mcp__forge__docs_lookup`; an owner choosing what a reviewer may touch needs plain names, and
 *   needs to see at a glance which tools change files or run code (a reviewer or researcher may
 *   hold none). This builds the checklist from the catalogue, falls back to the native tools
 *   Forge always ships when the catalogue cannot be read, and keeps a tool the agent already
 *   holds visible even when the catalogue no longer lists it, so a save never silently drops it.
 *
 * Exports: FALLBACK_TOOLS, toolOptions(), toolLabel(), WRITE_TOOL_REASON.
 * Depends on: @forge/core (isWriteClassTool), types/agent-ui.types.
 */

import { isWriteClassTool } from '@forge/core';
import type { ToolOption } from '#/types/agent-ui.types.js';

/** Shown when the catalogue cannot be read: the native tools every install has. */
export const FALLBACK_TOOLS: readonly { id: string; risk: string }[] = [
  { id: 'read', risk: 'read' },
  { id: 'glob', risk: 'read' },
  { id: 'grep', risk: 'read' },
  { id: 'edit', risk: 'write-cwd' },
  { id: 'write', risk: 'write-cwd' },
  { id: 'shell', risk: 'exec' },
  { id: 'task', risk: 'exec' },
];

/** Why a write tool is greyed out for a reviewer or researcher. */
export const WRITE_TOOL_REASON =
  'Changes files or runs commands. Reviewers and researchers cannot use it.';

const NAMES: Readonly<Record<string, string>> = {
  read: 'Read files',
  glob: 'Find files by name',
  grep: 'Search file contents',
  edit: 'Edit files',
  write: 'Create files',
  shell: 'Run commands',
  task: 'Hand work to a sub-agent',
};

/** "docs_lookup" becomes "Docs lookup"; known native tools get their plain name. */
export function toolLabel(id: string): string {
  const known = NAMES[id];
  if (known) {
    return known;
  }

  const last = id.startsWith('mcp__') ? (id.split('__').pop() ?? id) : id;
  const words = last.replace(/[_-]+/g, ' ').trim();

  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Catalogue rows (or the fallback) plus any tool already chosen, native ones first. */
export function toolOptions(
  entries: readonly { id: string; risk: string }[] | undefined,
  chosen: readonly string[],
): readonly ToolOption[] {
  const rows = [...(entries ?? FALLBACK_TOOLS)];
  for (const id of chosen) {
    if (!rows.some((r) => r.id === id)) {
      rows.push({ id, risk: '' });
    }
  }

  return rows
    .map((row) => ({
      id: row.id,
      label: toolLabel(row.id),
      risk: row.risk === '' ? undefined : row.risk,
      writes: isWriteClassTool(row.id),
    }))
    .sort(
      (a, b) =>
        Number(a.id.startsWith('mcp__')) - Number(b.id.startsWith('mcp__')) ||
        a.label.localeCompare(b.label),
    );
}
