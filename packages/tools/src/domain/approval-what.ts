/**
 * Approval text — the exact thing the owner is asked to allow, in words.
 *
 * Why: the owner's consent is only worth something if what they read is what runs. The text is
 *   built from the tokenised call (every shell segment in full, the normalised paths, the whole
 *   URL), never from the Worker's own description, so a Worker cannot dress a dangerous command
 *   in a harmless label. Nothing here knows a language or package manager: a segment is opaque
 *   text (tool-system.md §5.4, d-0175).
 *
 * Exports: approvalWhat(), APPROVAL_WHAT_MAX.
 * Depends on: domain/call-resource, domain/tokenizer, domain/tool-id, shared/path, types/admit. No IO.
 */

import {
  PATH_TOOLS,
  pathResources,
  resourceOf,
  shellDialect,
} from '#/domain/call-resource.js';
import { tokenizeShell } from '#/domain/tokenizer.js';
import { SHELL_TOOL_ID, toolAction } from '#/domain/tool-id.js';
import { normalizePath } from '#/shared/path.js';
import type { AdmitCall, AdmitContext } from '#/types/admit.types.js';

/** The longest text shown for one call; longer is clipped with an ellipsis. */
export const APPROVAL_WHAT_MAX = 2000;

const clip = (text: string): string =>
  text.length > APPROVAL_WHAT_MAX ? `${text.slice(0, APPROVAL_WHAT_MAX - 1)}…` : text;

/** What the call does, for the owner; falls back to the tool id when nothing can be named. */
export function approvalWhat(ctx: AdmitContext, call: AdmitCall): string {
  const def =
    ctx.catalogue.status === 'verified' ? ctx.catalogue.tools.get(call.tool) : undefined;

  if (!def) {
    return clip(call.tool);
  }

  if (def.id === SHELL_TOOL_ID) {
    const command = call.input?.['command'];
    const tokens =
      typeof command === 'string'
        ? tokenizeShell(command, shellDialect(call.native))
        : null;

    return tokens?.ok ? clip(tokens.value.map((s) => s.text).join(' ; ')) : clip(def.id);
  }

  const action = toolAction(def.id);
  if (PATH_TOOLS.has(action)) {
    const paths = pathResources(action, call.input);

    return clip(
      paths === null
        ? def.id
        : `${action} ${paths.map((p) => normalizePath(p, ctx.cwd)).join(', ')}`,
    );
  }

  const plain = resourceOf(def, call);

  return clip(plain === '' ? def.id : plain);
}
