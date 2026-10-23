/**
 * Permission copy: the plain words around a tool approval (what the Worker wants, which rule
 * asked, what "Always" would remember) and the safe way to show the exact command.
 *
 * Why: on Standard and Full a Worker's install or sensitive edit does not run until the owner
 *   answers, and the owner is usually not a programmer. They must see exactly what would run,
 *   never a reworded version of it, and be told in their own terms why Forge asks and what
 *   "Always for this project" would keep. A command can hide text from the eye (a right-to-left
 *   override that reorders what is read, zero-width characters, a lookalike space), so every
 *   invisible character is turned into a visible marker before the owner decides. Reason codes
 *   and rule patterns never reach the screen raw: `prisma/migrations/**` becomes "edits under
 *   `prisma/migrations/`". Examples are language-neutral (d-0176). Pure.
 *
 * Exports: revealInvisible(), wantsLine(), ruleLine(), alwaysLine(), laneWords(), approvedRuleWords().
 * Depends on: types/escalation-ui.types (types). No IO.
 */

import type { PermissionTextPart } from '#/types/escalation-ui.types.js';

/** Characters a reader cannot see or that look like something else; newline and tab stay as they are. */
const HIDDEN = /[\p{Cf}\p{Cc}\u00A0\u2028\u2029\u3164]/u;

/** `‹U+202E›`: the visible stand-in for one hidden character. */
const marker = (char: string): string =>
  `‹U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}›`;

/** The text split into runs, each hidden character as its own run drawn as a visible marker. */
export function revealInvisible(text: string): readonly PermissionTextPart[] {
  const parts: PermissionTextPart[] = [];
  let plain = '';

  for (const char of text) {
    if (char !== '\n' && char !== '\t' && HIDDEN.test(char)) {
      if (plain !== '') {
        parts.push({ text: plain, hidden: false });
        plain = '';
      }

      parts.push({ text: marker(char), hidden: true });
    } else {
      plain += char;
    }
  }

  if (plain !== '') {
    parts.push({ text: plain, hidden: false });
  }

  return parts;
}

const LANE_WORDS: Readonly<Record<string, string>> = {
  express: 'the Express lane (the fast way, with nobody watching)',
  standard: 'the Standard lane (the normal way Forge runs a ticket)',
  full: 'the Full lane (the most careful way Forge runs a ticket)',
};

/** A lane named in plain words with a short explanation, so "lane" is never a bare term. */
export function laneWords(lane: string): string {
  return LANE_WORDS[lane] ?? `the ${lane} lane`;
}

/** What the Worker wants to do, from the tool's action. */
export function wantsLine(action: string): string {
  switch (action) {
    case 'shell':
      return 'The Worker wants to run this command';
    case 'edit':
    case 'write':
      return 'The Worker wants to change this file';
    case 'web_fetch':
      return 'The Worker wants to open this page';
    default:
      return 'The Worker wants to use this tool';
  }
}

/** Why Forge asked, in plain words, from the policy reason and the lane. */
export function ruleLine(reasonCode: string, lane: string): string {
  const where = `in ${laneWords(lane)}`;

  switch (reasonCode) {
    case 'rule_ask':
      return `Steps like this need your approval ${where}.`;
    case 'no_matching_rule':
      return `Nothing says this step is safe yet, so Forge asks you first ${where}.`;
    case 'inspector_raised':
    case 'inspector_error':
      return 'A safety check flagged this step, so Forge asks you first.';
    case 'budget_exceeded':
    case 'budget_soft_limit':
      return 'This step goes past a usage limit, so Forge asks you first.';
    default:
      return `This step needs your approval ${where}.`;
  }
}

/** The rule's resource drawn as a place or a command, without glob syntax. */
function resourceWords(action: string, resource: string): string {
  if ((action === 'edit' || action === 'write') && resource.endsWith('/**')) {
    return resource.slice(0, -2);
  }

  return resource;
}

/** The sentence that spells out what a stored rule lets through, such as "Always allow edits under `x/`". */
export function approvedRuleWords(rule: { action: string; resource: string }): string {
  const { action } = rule;
  const where = resourceWords(action, rule.resource);

  if (action === 'shell') {
    return `Always allow the command \`${where}\``;
  }

  if (action === 'edit' || action === 'write') {
    return rule.resource.endsWith('/**')
      ? `Always allow edits under \`${where}\``
      : `Always allow edits to \`${where}\``;
  }

  if (action === 'web_fetch') {
    return `Always allow opening \`${where}\``;
  }

  return `Always allow \`${action}\` on \`${where}\``;
}

/** What "Always for this project" would keep, or why it is not on offer. */
export function alwaysLine(always: {
  offered: boolean;
  rule?: { action: string; resource: string } | undefined;
  why?: string | undefined;
}): string {
  if (always.offered && always.rule !== undefined) {
    return `${approvedRuleWords(always.rule)}, in this project only.`;
  }

  return `“Always” is not offered here. ${always.why ?? 'This kind of step is approved each time.'}`;
}
