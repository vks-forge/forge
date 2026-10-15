/**
 * Lane defaults — the §12 table as data: which tools each process lane may ever see and
 * what its call-time rules say.
 *
 * Why: Express is for small, low-blast-radius changes run with nobody watching; Full is
 *   for risky ones with a human in the loop. The tools a Worker gets and the questions
 *   it is asked must follow the lane mechanically, otherwise a cheap ticket could
 *   install packages or fetch the web, and a heavy one could be starved of what it needs.
 *   Express turns every `ask` into a denial (nobody to answer); Standard and Full route
 *   asks to a human. These are the ceilings; project and ticket grants can only narrow
 *   them (tool-system.md §12).
 *
 * Exports: LANE_DEFAULTS, LANE_UNATTENDED, laneRulesFor().
 * Depends on: @forge/core (Lane), schemas/grant, types/grants, domain/floors, domain/shell-allowlist. No IO.
 */

import type { Lane } from '@forge/core';
import type { CallRule, Effect } from '#/schemas/grant.js';
import { PROTECTED_PATHS } from '#/domain/floors.js';
import { shellSafeRules } from '#/domain/shell-allowlist.js';
import type { LaneDefaults } from '#/types/grants.types.js';
import type { ShellAllowInput } from '#/types/shell-allowlist.types.js';

const READ_TOOLS = [
  'read',
  'grep',
  'glob',
  'mcp__forge__code_graph',
  'mcp__forge__docs_lookup',
];

const CORE_TOOLS = [
  'mcp__forge__get_ticket',
  'mcp__forge__add_comment',
  'mcp__forge__ask_director',
  'mcp__forge__report_blocked',
  'mcp__forge__finish',
];

const EXPRESS_TOOLS = [...READ_TOOLS, ...CORE_TOOLS, 'edit', 'write', 'shell'];
const WEB_TOOLS = ['mcp__forge__web_search', 'mcp__forge__web_fetch'];

const INSTALL = [
  'pnpm add*',
  'pnpm install*',
  'pnpm i',
  'pnpm i *',
  'npm install*',
  'npm i',
  'npm i *',
  'npm ci',
  'yarn add*',
  'yarn install*',
  'pip install*',
  'pip3 install*',
  'cargo add*',
  'go get*',
  'poetry add*',
  'uv add*',
  'uv pip install*',
];

const SENSITIVE_DIRS = ['migrations/**', '**/migrations/**', 'auth/**', '**/auth/**'];

const rule = (action: string, resource: string, effect: Effect): CallRule => ({
  action,
  resource,
  effect,
});

/**
 * The call rules of a lane. `shell` names the project (check commands, ecosystems) the shell
 * allow-list is built from; without it every ecosystem applies.
 */
export function laneRulesFor(lane: Lane, shell?: ShellAllowInput): CallRule[] {
  const sensitive: Effect = lane === 'express' ? 'deny' : 'ask';
  const install: Effect = lane === 'express' ? 'deny' : 'ask';
  const rules: CallRule[] = [
    ...shellSafeRules(shell).map((r) => rule('shell', r, 'allow')),
    ...INSTALL.map((r) => rule('shell', r, install)),
    ...['read', 'grep', 'glob', 'edit', 'write'].map((a) => rule(a, '**', 'allow')),
    ...[...CORE_TOOLS, ...READ_TOOLS.filter((t) => t.startsWith('mcp__'))].map((t) =>
      rule(t.split('__')[2] as string, '*', 'allow'),
    ),
  ];

  if (lane !== 'express') {
    rules.push(rule('web_search', '*', 'allow'));
    rules.push(rule('web_fetch', '*', 'ask'));
    if (lane === 'standard') {
      rules.push(rule('web_fetch', 'https://docs.*', 'allow'));
    }

    rules.push(rule('db_query_readonly', '*', 'allow'));
    // Capability gate already requires an explicit project grant for these.
    rules.push(rule('project_mcp', '*', 'allow'));
  }

  // Later rules win, so the path restrictions and the protected-path shield come last.
  for (const a of ['edit', 'write']) {
    for (const p of SENSITIVE_DIRS) {
      rules.push(rule(a, p, sensitive));
    }

    for (const p of PROTECTED_PATHS) {
      rules.push(rule(a, p, lane === 'express' ? 'deny' : 'ask'));
    }
  }

  return rules;
}

const base = { deny: ['mcp__forge__memory_search'] } as const;

export const LANE_DEFAULTS: Readonly<Record<Lane, LaneDefaults>> = {
  express: {
    ...base,
    allow: EXPRESS_TOOLS,
    projectGated: [],
    projectMcps: false,
    rules: laneRulesFor('express'),
  },
  standard: {
    ...base,
    allow: [...EXPRESS_TOOLS, ...WEB_TOOLS],
    projectGated: ['mcp__forge__db_query_readonly'],
    projectMcps: true,
    rules: laneRulesFor('standard'),
  },
  full: {
    ...base,
    allow: [...EXPRESS_TOOLS, ...WEB_TOOLS],
    projectGated: ['mcp__forge__db_query_readonly'],
    projectMcps: true,
    rules: laneRulesFor('full'),
  },
};

/** Express has no human watching: `ask` becomes `deny`. Standard and Full route asks to Needs-you. */
export const LANE_UNATTENDED: Readonly<Record<Lane, boolean>> = {
  express: true,
  standard: false,
  full: false,
};
