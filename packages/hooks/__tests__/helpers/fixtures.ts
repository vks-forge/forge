/**
 * Shared fixtures for @forge/hooks tests.
 *
 * Why: handler tests need a believable run, catalogue and policy stub, and the client
 *   tests need payloads shaped like the ones the harness really sends (probe 2 and 5:
 *   `hook_event_name` and `tool_name` on stdin, `PowerShell` on the Windows CLI and
 *   `Bash` on ACP). Building them once keeps every test on the same shapes.
 *
 * Exports: SECRET, TOKEN, RUN_ID, pre(), preWith(), post(), failure(), sessionStart(), testCtx(), makeEnv().
 * Depends on: @forge/db, @forge/tools, src/index. IO only when `sqlitePath` is given.
 */

import { createMemoryReceiptLog, createMemoryStorage, openSqlite } from '@forge/db';
import { ToolDefinition, admit as realAdmit, effectiveGrant } from '@forge/tools';
import type { AdmitCall, AdmitContext, ApprovalSet, Decision } from '@forge/tools';
import type { Run } from '@forge/core';
import { createHookHandler } from '#/index.js';
import type { HookAudit, RaiseApproval, RunCredentials } from '#/index.js';

export const SECRET = 'run-secret-0123456789abcdef-0123456789';
export const TOKEN = 'bearer-7f3a91c2';
export const RUN_ID = 'run-1';

export const sessionStart = () => ({
  hook_event_name: 'SessionStart',
  source: 'startup',
});
export const pre = (tool = 'PowerShell', command = 'echo hi', id?: string) => ({
  hook_event_name: 'PreToolUse',
  tool_name: tool,
  tool_input: { command },
  ...(id ? { tool_use_id: id } : {}),
});
/** A PreToolUse payload with an arbitrary `tool_input` (path tools, network tools). */
export const preWith = (tool: string, input: Record<string, unknown>, id?: string) => ({
  hook_event_name: 'PreToolUse',
  tool_name: tool,
  tool_input: input,
  ...(id ? { tool_use_id: id } : {}),
});
export const post = (tool = 'PowerShell', id?: string) => ({
  hook_event_name: 'PostToolUse',
  tool_name: tool,
  tool_input: { command: 'echo hi' },
  tool_response: { stdout: 'hi' },
  ...(id ? { tool_use_id: id } : {}),
});
export const failure = (tool = 'PowerShell', id?: string) => ({
  hook_event_name: 'PostToolUseFailure',
  tool_name: tool,
  tool_input: {},
  error: 'boom',
  ...(id ? { tool_use_id: id } : {}),
});

const def = (id: string, risk: string, native: string | string[]) =>
  ToolDefinition.parse({
    id,
    kind: 'harness-native',
    version: '1',
    risk,
    exposure: 'direct',
    schema_hash: `sha256:${'a'.repeat(64)}`,
    support: { 'claude-code': { native, mechanism: 'allow-flag', enforced: 'hook' } },
  });

/** The standard-lane context the handler tests judge calls in. */
export const testCtx = (dataHome = '/forge-home', cwd?: string): AdmitContext => ({
  lane: 'standard',
  harness: 'claude-code',
  catalogue: {
    status: 'verified',
    hash: 'h',
    tools: new Map([
      ['shell', def('shell', 'exec', ['Bash', 'PowerShell'])],
      ['read', def('read', 'read', 'Read')],
      ['write', def('write', 'write-cwd', 'Write')],
    ]),
  },
  grant: effectiveGrant('standard', undefined, undefined, [], {
    dataHome,
  }),
  liveSchemaHashes: Object.fromEntries(
    ['shell', 'read', 'write'].map((id) => [id, `sha256:${'a'.repeat(64)}`]),
  ),
  ...(cwd === undefined ? {} : { cwd }),
});

/** Stub policy: denies any call whose command contains "deny"; records what it saw. */
export function makeEnv(
  over: {
    throwOnAdmit?: boolean;
    sqlitePath?: string;
    audit?: HookAudit;
    clock?: () => Date;
    requireLiveness?: boolean;
    /** While true the server is shutting down and admits no new tool calls. */
    draining?: () => boolean;
    /** Replaces the fixed generation-1 credentials, to test resumes. */
    credentials?: () => Promise<RunCredentials | null>;
    /** Replaces the run row's fields (generation, status). */
    run?: Partial<Run>;
    /** Judge calls with the real `admit()` over this data home and worktree, not the stub. */
    real?: { dataHome: string; cwd: string };
    /** The owner's answers the context carries (real mode only). */
    approvals?: ApprovalSet;
    /** The engine's door for an ask; absent leaves an `ask` as `admit()` judged it. */
    raiseApproval?: RaiseApproval;
  } = {},
) {
  // Memory by default; `sqlitePath` runs the same handler over the durable SQLite backend.
  const sqlite = over.sqlitePath ? openSqlite(over.sqlitePath) : null;
  const db = sqlite?.storage ?? createMemoryStorage();
  const receipts = sqlite?.receipts ?? createMemoryReceiptLog();
  const admitted: AdmitCall[] = [];
  const liveness: string[] = [];
  let tick = 0;
  const handler = createHookHandler({
    db,
    receipts,
    credentials:
      over.credentials ??
      (async (id) =>
        id === RUN_ID ? { token: TOKEN, secret: SECRET, generation: 1 } : null),
    admitContext: async () =>
      over.real
        ? {
            ...testCtx(over.real.dataHome, over.real.cwd),
            ...(over.approvals ? { approvals: over.approvals } : {}),
          }
        : testCtx(),
    clock: over.clock ?? (() => new Date(Date.UTC(2026, 9, 13, 0, 0, tick++))),
    ...(over.audit ? { audit: over.audit } : {}),
    ...(over.requireLiveness ? { requireLiveness: true } : {}),
    ...(over.draining ? { draining: over.draining } : {}),
    ...(over.raiseApproval ? { raiseApproval: over.raiseApproval } : {}),
    onLiveness: async (id) => {
      liveness.push(id);
    },
    admit: (c, call): Decision => {
      if (over.real) {
        admitted.push(call);

        return realAdmit(c, call);
      }

      if (over.throwOnAdmit) {
        throw new Error('admit exploded');
      }

      admitted.push(call);
      const denied = String(call.input?.['command'] ?? '').includes('deny');

      return {
        decision: denied ? 'deny' : 'allow',
        reason: denied ? 'rule_deny' : 'rule_allow',
        enforced_by: 'forge_admit',
        enforcement: 'hook',
        layer: 'rule',
        matched_rule: null,
        finding_ids: [],
        tool: call.tool,
      };
    },
  });

  const ready = db.transaction((tx) =>
    tx.runs.insert({
      id: RUN_ID,
      ticket_id: 'T-1',
      harness: 'claude-code',
      driver_version: '0',
      cwd: over.real?.cwd ?? '/w',
      lane: 'standard',
      started_at: '2026-10-13T00:00:00.000Z',
      status: 'running',
      owner: 'server-1',
      ...over.run,
    }),
  );

  return { handler, receipts, admitted, liveness, ready, db, close: () => db.close() };
}
