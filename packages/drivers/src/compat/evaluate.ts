/**
 * Judges a scripted session: turns what a harness build did into the compatibility checks.
 *
 * Why: Forge's safety model rests on facts measured on one build and assumed for the next:
 *   hooks are registered before the first tool call, a tool call is announced before its
 *   permission request and result, permission requests reach us and a denial really stops
 *   the tool, and the hook's tool id matches the id the harness announces (the join the
 *   receipt cross-check relies on, d-0064). On a new build any of these can silently stop
 *   being true, and a Worker would then run outside policy with nobody noticing. Each fact
 *   is one check here, judged over a plain trace of the session, so a broken build produces
 *   a `fail` with a plain sentence the owner can act on instead of an unexplained kill
 *   later. A check that does not apply to the engine in use is `skipped`, never a pass.
 *
 * Exports: evaluateChecks(), summarize(), CORE_TOOLS.
 * Depends on: @forge/core (CompatCheck), compat/tool-shapes, types/compat. No IO.
 */

import type { CompatCheck } from '@forge/core';
import { toolShapes } from '#/compat/tool-shapes.js';
import type { CompatTrace, NativeToolNames } from '#/types/compat/compat.types.js';

/** Catalogue tools every build must offer for Workers to function at all. */
export const CORE_TOOLS = ['read', 'glob', 'grep', 'edit', 'write', 'shell'] as const;

const pass = (id: CompatCheck['id'], detail: string): CompatCheck => ({
  id,
  status: 'pass',
  detail,
});

const fail = (id: CompatCheck['id'], detail: string): CompatCheck => ({
  id,
  status: 'fail',
  detail,
});

function installedBuild(t: CompatTrace): CompatCheck {
  if (t.runVersion === null) {
    return fail(
      'runs_installed_build',
      'the model API never received a request from the harness, so the build under test could not be confirmed',
    );
  }

  return t.runVersion === t.installedVersion
    ? pass('runs_installed_build', `the harness ran build ${t.runVersion}`)
    : fail(
        'runs_installed_build',
        `the session ran build ${t.runVersion} but the installed build is ${t.installedVersion}; the check would not describe the install`,
      );
}

function toolSchemas(t: CompatTrace, nativeTools: NativeToolNames): CompatCheck {
  const shapes = toolShapes(t.captured, nativeTools);
  const missing = CORE_TOOLS.filter((id) => !shapes.some((s) => s.tool === id));
  if (t.captured.length === 0) {
    return fail('tool_schemas', 'no tool list was captured from the harness');
  }

  return missing.length === 0
    ? pass(
        'tool_schemas',
        `captured ${t.captured.length} tools; ${shapes.length} map to catalogue tools`,
      )
    : fail('tool_schemas', `the build does not offer: ${missing.join(', ')}`);
}

function hooksFirst(t: CompatTrace): CompatCheck {
  const start = t.hooks.findIndex((h) => h.event === 'SessionStart');
  const firstTool = t.hooks.findIndex((h) => h.event === 'PreToolUse');
  if (firstTool === -1) {
    return fail('hooks_before_first_tool', 'no tool call reached the hook');
  }

  if (start === -1 || start > firstTool) {
    return fail(
      'hooks_before_first_tool',
      'the hook saw a tool call before (or without) the session start event',
    );
  }

  return pass(
    'hooks_before_first_tool',
    `session start came first, then ${t.hooks.filter((h) => h.event === 'PreToolUse').length} tool calls`,
  );
}

function acpOrder(t: CompatTrace): CompatCheck {
  if (t.engine !== 'acp') {
    return { id: 'acp_event_order', status: 'skipped', detail: 'engine is not ACP' };
  }

  const announced = new Set<string>();
  for (const e of t.events) {
    if (e.type === 'tool_call') {
      announced.add(e.call_id);
    } else if (e.type === 'permission' || e.type === 'tool_result') {
      if (!announced.has(e.call_id)) {
        return fail(
          'acp_event_order',
          `${e.type} for call ${e.call_id} arrived before the call was announced`,
        );
      }
    }
  }

  return announced.size === 0
    ? fail('acp_event_order', 'no tool call was announced')
    : pass(
        'acp_event_order',
        `${announced.size} calls, each announced before its result`,
      );
}

function permissions(t: CompatTrace): CompatCheck {
  const decisions = t.events.filter((e) => e.type === 'permission');
  if (t.engine === 'acp' && decisions.length === 0) {
    return fail(
      'permission_requests',
      'the adapter sent no permission request for any tool',
    );
  }

  if (t.deniedFileExists) {
    return fail(
      'permission_requests',
      'a call the hook denied still ran: its file exists',
    );
  }

  if (!t.allowedFileExists) {
    return fail('permission_requests', 'a call the hook allowed did not run');
  }

  return pass(
    'permission_requests',
    t.engine === 'acp'
      ? `${decisions.length} permission requests answered; the denied call did not run`
      : 'the denied call did not run and the allowed call did',
  );
}

function receipts(t: CompatTrace): CompatCheck {
  const hookIds = new Set(t.hooks.flatMap((h) => (h.toolUseId ? [h.toolUseId] : [])));
  const calls = t.events.filter((e) => e.type === 'tool_call');
  const orphan = calls.find((e) => e.type === 'tool_call' && !hookIds.has(e.call_id));
  const killed = t.events.find((e) => e.type === 'error' && e.family === 'policy_denied');

  if (killed?.type === 'error') {
    return fail('receipt_timing', `the driver stopped the run: ${killed.message}`);
  }

  if (orphan?.type === 'tool_call') {
    return fail(
      'receipt_timing',
      `call ${orphan.call_id} (${orphan.name}) has no hook record under the same id`,
    );
  }

  return calls.length === 0
    ? fail('receipt_timing', 'no tool call was seen')
    : pass('receipt_timing', `all ${calls.length} calls matched their hook record by id`);
}

/** The five behaviour checks plus the build and schema checks, in report order. */
export function evaluateChecks(
  t: CompatTrace,
  nativeTools: NativeToolNames,
): CompatCheck[] {
  const behaviour: CompatCheck[] =
    t.runError === null
      ? [hooksFirst(t), acpOrder(t), permissions(t), receipts(t)]
      : (
          [
            'hooks_before_first_tool',
            'acp_event_order',
            'permission_requests',
            'receipt_timing',
          ] as const
        ).map((id) =>
          id === 'acp_event_order' && t.engine !== 'acp'
            ? { id, status: 'skipped' as const, detail: 'engine is not ACP' }
            : fail(id, `the scripted session could not run: ${t.runError ?? ''}`),
        );

  return [installedBuild(t), ...behaviour, toolSchemas(t, nativeTools)];
}

/** One plain sentence for the owner. */
export function summarize(version: string, checks: readonly CompatCheck[]): string {
  const failed = checks.filter((c) => c.status === 'fail');
  const first = failed[0];
  if (!first) {
    return `Build ${version} passed all ${checks.filter((c) => c.status === 'pass').length} compatibility checks.`;
  }

  return `Build ${version} failed ${failed.length} of ${checks.length} compatibility checks (${first.id}: ${first.detail}). Runs on this harness are paused; install the last version that passed, or fix the cause and run the check again.`;
}
