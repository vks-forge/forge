/**
 * Shared builders for the call-time rule suites: a shell evaluator and a rule literal.
 *
 * Why: the shell, layer and path suites ask the same question (what does the lane's
 * effective grant say about this command?) from one working directory. Sharing the
 * evaluator keeps tokenising and grant resolution identical across them, so a difference
 * between suites is a policy difference, not a setup difference.
 *
 * Exports: CWD, sh(), rule().
 * Depends on: domain/rules, domain/grants, domain/tokenizer, helpers/fixtures. No IO.
 */

import { effectiveGrant } from '#/domain/grants.js';
import { evaluateShell } from '#/domain/rules.js';
import { tokenizeShell } from '#/domain/tokenizer.js';
import type { Lane } from '@forge/core';
import type { CallRule } from '#/schemas/grant.js';
import { grant } from '#tests/helpers/fixtures.js';

export const CWD = '/work/repo';

export function sh(
  lane: Lane,
  command: string,
  rules: CallRule[] = [],
  dialect: 'bash' | 'powershell' = 'bash',
) {
  const eff = effectiveGrant(lane, grant({ rules }));
  const t = tokenizeShell(command, dialect);
  if (!t.ok) {
    throw new Error(t.error);
  }

  return evaluateShell(eff, t.value, dialect, CWD);
}

export const rule = (
  action: string,
  resource: string,
  effect: CallRule['effect'],
): CallRule => ({
  action,
  resource,
  effect,
});
