/**
 * Test data for the Forge settings screens: a sample harness, tool schemas, GitHub connection
 * and settings history.
 *
 * Why: the Harnesses, GitHub, Limits and General screens each need something to show and
 *   something to change. These are plainly samples (`fixture-owner`, `sample-org`, hashes of
 *   repeated digits). Rows are parsed with the real core schemas, so a drift between the
 *   server's shape and this data fails loudly at import.
 *
 * Exports: harnessFixture(), reportFixture(), toolFixtures(), connectionFixtures(), historyFixtures().
 * Depends on: @forge/core, schemas/settings.
 */

import {
  CompatReport,
  ConfigVersion,
  GithubConnection,
  HarnessToolSchema,
} from '@forge/core';
import { HarnessView } from '#/schemas/settings.js';

const hash = (digit: string): string => `sha256:${digit.repeat(64)}`;

export function harnessFixture(): HarnessView {
  return HarnessView.parse({
    id: 'claude',
    kind: 'claude',
    version: '2.1.142',
    auth_mode: 'login',
    status: 'ok',
    last_checked_at: '2026-10-15T09:30:00.000Z',
    secrets: { api_key: false, oauth_token: false },
  });
}

/** A passing compatibility report for `version`: every check the server runs, passed. */
export function reportFixture(version: string): CompatReport {
  const ids = [
    ['hooks_before_first_tool', 'Our hook ran before the first tool call.'],
    ['acp_event_order', 'Events arrived in the expected order.'],
    ['permission_requests', 'A denied call was blocked and did not run.'],
    ['receipt_timing', 'Each tool call produced its receipt on time.'],
    ['tool_schemas', 'The build offered the tools we know how to police.'],
    ['runs_installed_build', 'The check ran the build that is installed now.'],
  ] as const;

  return CompatReport.parse({
    kind: 'claude',
    version,
    started_at: '2026-10-15T09:30:00.000Z',
    finished_at: '2026-10-15T09:31:10.000Z',
    passed: true,
    summary: 'This build behaves the way Forge needs. Workers can use it.',
    checks: ids.map(([id, detail]) => ({ id, status: 'pass', detail })),
    tools: [],
  });
}

/** Four tools of the installed build; `shell` changed since it was last approved. */
export function toolFixtures(): HarnessToolSchema[] {
  const row = (tool: string, digit: string, status: string, by?: string) => ({
    harness_kind: 'claude',
    version: '2.1.142',
    tool,
    schema_hash: hash(digit),
    status,
    ...(by === undefined
      ? {}
      : {
          decided_by: by,
          decided_at: '2026-10-01T08:00:00.000Z',
          decision_reason: 'Shipped list',
        }),
  });

  return [
    row('read', '1', 'approved', 'forge-release'),
    row('edit', '2', 'approved', 'forge-release'),
    row('shell', '3', 'pending'),
    row('web_fetch', '4', 'denied', 'fixture-owner'),
  ].map((r) => HarnessToolSchema.parse(r));
}

export function connectionFixtures(): GithubConnection[] {
  return [
    GithubConnection.parse({
      id: 'sample-org',
      account: 'sample-org',
      app_id: '123456',
      app_slug: 'forge-sample',
      key_secret_name: 'github/sample-org/key',
      status: 'active',
      created_at: '2026-09-20T10:00:00.000Z',
    }),
  ];
}

/** Two saved company versions, oldest first. */
export function historyFixtures(): ConfigVersion[] {
  return [
    ConfigVersion.parse({
      id: 1,
      scope: 'company',
      project: null,
      version: 1,
      doc: { engine: { max_concurrent_global: 3 } },
      author: 'fixture-owner',
      reason: 'More room on a bigger machine',
      created_at: Date.parse('2026-09-22T12:00:00.000Z'),
    }),
    ConfigVersion.parse({
      id: 2,
      scope: 'company',
      project: null,
      version: 2,
      doc: { engine: { max_concurrent_global: 3, shutdown_drain_ms: 20_000 } },
      author: 'fixture-owner',
      reason: 'Let long tool calls finish on stop',
      created_at: Date.parse('2026-10-02T15:30:00.000Z'),
    }),
  ];
}
