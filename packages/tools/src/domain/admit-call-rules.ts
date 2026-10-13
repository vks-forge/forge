/**
 * Call-time rule step of admit(): turns a tool call into a rule verdict.
 *
 * Why: the same grant rules must judge a shell line, a file path and a plain tool call,
 *   each with its own resource shape. Pulling resource extraction and rule evaluation out
 *   of the admission sequence keeps `admit` a readable list of gates, and guarantees a
 *   call whose resource cannot be determined (no string path, unparsable shell) is
 *   refused instead of being judged as "the cwd" (tool-system.md �5.5).
 *
 * Exports: callRules().
 * Depends on: domain/call-resource, domain/rules, domain/tool-id, domain/tokenizer,
 *   domain/admit-draft, schemas/tool-definition, types/admit. No IO.
 */

import {
  PATH_TOOLS,
  pathResources,
  resourceOf,
  shellDialect,
} from '#/domain/call-resource.js';
import { deny, outcomeDraft, raise } from '#/domain/admit-draft.js';
import { evaluateShell, evaluateToolRules } from '#/domain/rules.js';
import { tokenizeShell } from '#/domain/tokenizer.js';
import { SHELL_TOOL_ID, toolAction } from '#/domain/tool-id.js';
import type { ToolDefinition } from '#/schemas/tool-definition.js';
import type {
  AdmitCall,
  AdmitContext,
  AdmitDraft as Draft,
} from '#/types/admit.types.js';

export function callRules(
  ctx: AdmitContext,
  def: ToolDefinition,
  call: AdmitCall,
): Draft {
  if (def.id !== SHELL_TOOL_ID) {
    const action = toolAction(def.id);
    if (PATH_TOOLS.has(action)) {
      const resources = pathResources(action, call.input);
      if (resources === null) {
        return deny('invalid_resource', 'rule');
      }

      let worst: Draft | null = null;
      for (const r of resources) {
        const d = outcomeDraft(evaluateToolRules(ctx.grant, action, r, ctx.cwd));
        worst = worst === null ? d : raise(worst, d);
      }

      return worst ?? deny('invalid_resource', 'rule');
    }

    return outcomeDraft(
      evaluateToolRules(ctx.grant, action, resourceOf(def, call), ctx.cwd),
    );
  }

  const command = call.input?.['command'];
  if (typeof command !== 'string') {
    return deny('untokenizable', 'rule');
  }

  const dialect = shellDialect(call.native);
  const tokens = tokenizeShell(command, dialect);
  if (!tokens.ok) {
    return deny(tokens.error, 'rule');
  }

  return outcomeDraft(evaluateShell(ctx.grant, tokens.value, dialect, ctx.cwd));
}
