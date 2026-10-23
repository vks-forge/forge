/**
 * Approval key — the identity of one tool call for an owner's answer.
 *
 * Why: the owner approves "this exact command", not "a command like it". The answer is stored
 *   against a key and the resumed Worker retries the call; only a call with the same key may
 *   ride on that answer, so an approval for `pnpm add zod` cannot cover `pnpm add evil`, and a
 *   changed harness schema asks again. The key uses the full resource (shell segments are
 *   not clipped like receipts are, paths are normalised, a URL is whole) and ignores
 *   harness-only fields such as Bash `description`, so a Worker rewording its own note does
 *   not look like a new call. Shell commands stay opaque tokenised segments: nothing here knows
 *   a language or package manager (tool-system.md §5.4, d-0175).
 *
 * Exports: approvalKey().
 * Depends on: domain/call-resource, domain/tokenizer, domain/tool-id, shared/canonical-json, shared/hmac,
 *   shared/path, schemas/tool-definition, types/admit. No IO.
 */

import {
  PATH_TOOLS,
  pathResources,
  resourceOf,
  shellDialect,
} from '#/domain/call-resource.js';
import { tokenizeShell } from '#/domain/tokenizer.js';
import { SHELL_TOOL_ID, isProjectMcp, toolAction } from '#/domain/tool-id.js';
import type { ToolDefinition } from '#/schemas/tool-definition.js';
import { canonicalJson } from '#/shared/canonical-json.js';
import { sha256Hex } from '#/shared/hmac.js';
import { normalizePath } from '#/shared/path.js';
import type { AdmitCall, AdmitContext } from '#/types/admit.types.js';

/** Input fields a harness adds for its own display; they never change what a call does. */
const HARNESS_ONLY_FIELDS = new Set(['description']);

function canonicalArgs(input: AdmitCall['input']): unknown {
  return Object.fromEntries(
    Object.entries(input ?? {}).filter(([k]) => !HARNESS_ONLY_FIELDS.has(k)),
  );
}

/** What the call touches, in full; `null` when it cannot be named safely. */
function fullResource(ctx: AdmitContext, def: ToolDefinition, call: AdmitCall): unknown {
  if (def.id === SHELL_TOOL_ID) {
    const command = call.input?.['command'];
    if (typeof command !== 'string') {
      return null;
    }

    const dialect = shellDialect(call.native);
    const tokens = tokenizeShell(command, dialect);

    return tokens.ok ? { dialect, segments: tokens.value.map((s) => s.text) } : null;
  }

  const action = toolAction(def.id);
  if (PATH_TOOLS.has(action)) {
    const paths = pathResources(action, call.input);

    return paths === null ? null : paths.map((p) => normalizePath(p, ctx.cwd));
  }

  const plain = isProjectMcp(def.id) ? '' : resourceOf(def, call);

  return plain === '' ? { args: canonicalArgs(call.input) } : { resource: plain };
}

/**
 * A stable hash of tool id, the live schema hash and the full resource, or `null` when the
 * call cannot be named (unverified catalogue, unknown tool, untokenizable command, bad
 * path): a call with no key can never be approved, which fails closed.
 */
export function approvalKey(ctx: AdmitContext, call: AdmitCall): string | null {
  if (ctx.catalogue.status !== 'verified') {
    return null;
  }

  const def = ctx.catalogue.tools.get(call.tool);
  if (!def) {
    return null;
  }

  try {
    const resource = fullResource(ctx, def, call);
    if (resource === null) {
      return null;
    }

    const schema = Object.hasOwn(ctx.liveSchemaHashes, def.id)
      ? ctx.liveSchemaHashes[def.id]
      : '';

    return sha256Hex(canonicalJson({ tool: def.id, schema, resource }));
  } catch {
    return null;
  }
}
