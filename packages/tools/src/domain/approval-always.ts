/**
 * "Always for this project" — the narrowest rule that would cover an ask, or why none.
 *
 * Why: the owner is shown what "Always" would store before they click it. A shell call is
 *   remembered as that one segment's exact text, never a chain and never a wildcard; an edit
 *   under a sensitive folder is remembered as that folder (`prisma/migrations/**`), never a
 *   protected path. Anything else (an inspector or budget ask, a banned interpreter, a
 *   chain of several asking commands) is not offered, with a plain reason. Every candidate
 *   is proved by asking `admit()` itself whether the rule would allow the call, so the offer
 *   can never promise what policy would not honour (tool-system.md §13, d-0175).
 *
 * Exports: alwaysRuleFor().
 * Depends on: domain/admit, domain/call-resource, domain/lane-defaults, domain/rules, domain/tokenizer,
 *   domain/tool-id, schemas/decision, shared/path, types/admit, types/approval. No IO.
 */

import { admit } from '#/domain/admit.js';
import {
  PATH_TOOLS,
  pathResources,
  resourceOf,
  shellDialect,
} from '#/domain/call-resource.js';
import { LANE_UNATTENDED, SENSITIVE_DIR_NAMES } from '#/domain/lane-defaults.js';
import { evaluateShell } from '#/domain/rules.js';
import { tokenizeShell } from '#/domain/tokenizer.js';
import { SHELL_TOOL_ID, isProjectMcp, toolAction } from '#/domain/tool-id.js';
import type { Decision } from '#/schemas/decision.js';
import { normalizePath } from '#/shared/path.js';
import type { AdmitCall, AdmitContext } from '#/types/admit.types.js';
import type { AlwaysOffer, AlwaysRule } from '#/types/approval.types.js';

const no = (why: string): AlwaysOffer => ({ offered: false, why });

const UNREADABLE_COMMAND = 'The command could not be read.';

/** The one asking segment as a rule, or the reason there is none. */
function shellCandidate(ctx: AdmitContext, call: AdmitCall): AlwaysRule | string {
  const command = call.input?.['command'];
  if (typeof command !== 'string') {
    return UNREADABLE_COMMAND;
  }

  const dialect = shellDialect(call.native);
  const tokens = tokenizeShell(command, dialect);
  if (!tokens.ok) {
    return UNREADABLE_COMMAND;
  }

  const asking = tokens.value.filter(
    (s) => evaluateShell(ctx.grant, [s], dialect, ctx.cwd).effect !== 'allow',
  );

  const seg = asking[0];
  if (seg === undefined || asking.length !== 1) {
    return 'A chain of commands is approved each time.';
  }

  const clean =
    seg.assignments.length === 0 &&
    seg.redirects.length === 0 &&
    seg.flags.length === 0 &&
    !seg.nested;

  return clean
    ? { action: SHELL_TOOL_ID, resource: seg.text }
    : 'This command uses redirects, variables or expansion, so it is approved each time.';
}

/** The deepest sensitive folder the path sits under, as a rule, or the reason there is none. */
function pathCandidate(
  ctx: AdmitContext,
  call: AdmitCall,
  action: string,
): AlwaysRule | string {
  const paths = pathResources(action, call.input);
  const first = paths?.length === 1 ? paths[0] : undefined;
  if (first === undefined) {
    return 'The path could not be read.';
  }

  const parts = normalizePath(first, ctx.cwd).split('/');
  let idx = -1;
  for (const [i, p] of parts.slice(0, -1).entries()) {
    if (SENSITIVE_DIR_NAMES.includes(p)) {
      idx = i;
    }
  }

  return idx === -1
    ? 'Only edits under a sensitive folder can be remembered.'
    : { action, resource: `${parts.slice(0, idx + 1).join('/')}/**` };
}

function candidateFor(ctx: AdmitContext, call: AdmitCall): AlwaysRule | string {
  const def =
    ctx.catalogue.status === 'verified' ? ctx.catalogue.tools.get(call.tool) : undefined;

  if (!def) {
    return 'The tool is not known.';
  }

  if (def.id === SHELL_TOOL_ID) {
    return shellCandidate(ctx, call);
  }

  const action = toolAction(def.id);
  if (PATH_TOOLS.has(action)) {
    return pathCandidate(ctx, call, action);
  }

  const plain = isProjectMcp(def.id) ? def.id : resourceOf(def, call);

  return plain !== '' && !/[*?]/.test(plain)
    ? { action, resource: plain }
    : 'This call is approved each time.';
}

/**
 * The rule "Always for this project" would store for `call`, whose verdict was `decision`
 * (an `ask`). Not offered unless it came from a lane rule, and unless `admit()` confirms the
 * rule would then allow the call.
 */
export function alwaysRuleFor(
  ctx: AdmitContext,
  call: AdmitCall,
  decision: Pick<Decision, 'decision' | 'reason'>,
): AlwaysOffer {
  if (LANE_UNATTENDED[ctx.grant.lane] || ctx.unattended === true) {
    return no('Nobody can approve on this lane.');
  }

  if (
    decision.decision !== 'ask' ||
    (decision.reason !== 'rule_ask' && decision.reason !== 'no_matching_rule')
  ) {
    return no('This check is approved each time.');
  }

  const candidate = candidateFor(ctx, call);
  if (typeof candidate === 'string') {
    return no(candidate);
  }

  const probe: AdmitContext = {
    ...ctx,
    grant: {
      ...ctx.grant,
      approved: [
        ...ctx.grant.approved,
        { ...candidate, id: 'project:approved#probe', effect: 'allow' },
      ],
    },
  };

  const verdict = admit(probe, call);

  return verdict.decision === 'allow' && verdict.reason === 'approved_always'
    ? { offered: true, rule: candidate }
    : no('This call is approved each time.');
}
