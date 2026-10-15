/**
 * The judgement of a compatibility session: each check passes on a healthy trace and fails on
 * the specific breakage it exists to catch.
 *
 * Why: the check decides whether a harness build may run Workers. A judge that passed a broken
 * build would let a Worker run outside policy; one that failed a healthy build would pause the
 * owner's harness for nothing. Each fact (hook before first tool, announce before result,
 * permission requests answered and a denial honoured, hook id equal to call id, the build the
 * session really ran) is pinned against hand-made traces, including the broken ones no real
 * build produces.
 *
 * Pins: evaluateChecks() per check id, summarize() wording, skipped ACP checks on the CLI engine.
 * Depends on: src/compat/evaluate. No IO.
 */

import type { RunEvent } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { evaluateChecks, summarize } from '#/compat/evaluate.js';
import type { CompatTrace, NativeToolNames } from '#/types/compat/compat.types.js';

const NATIVE: NativeToolNames = {
  read: ['Read'],
  glob: ['Glob'],
  grep: ['Grep'],
  edit: ['Edit'],
  write: ['Write'],
  shell: ['Bash', 'PowerShell'],
};

const tool = (name: string) => ({ name, input_schema: { type: 'object', title: name } });
const base = { ts: '2026-10-14T10:00:00.000Z' };

const call = (id: string, name = 'Write'): RunEvent =>
  ({
    type: 'tool_call',
    seq: 0,
    ...base,
    call_id: id,
    name,
    input: {},
  }) as unknown as RunEvent;

const result = (id: string): RunEvent =>
  ({
    type: 'tool_result',
    seq: 0,
    ...base,
    call_id: id,
    output: '',
    is_error: false,
  }) as unknown as RunEvent;

const permission = (id: string): RunEvent =>
  ({
    type: 'permission',
    seq: 0,
    ...base,
    call_id: id,
    tool: 'write',
    decision: 'allow',
  }) as unknown as RunEvent;

const healthy = (over: Partial<CompatTrace> = {}): CompatTrace => ({
  engine: 'acp',
  runVersion: '2.1.299',
  installedVersion: '2.1.299',
  captured: ['Read', 'Glob', 'Grep', 'Edit', 'Write', 'Bash'].map(tool),
  hooks: [
    { event: 'SessionStart' },
    { event: 'PreToolUse', toolUseId: 't1', toolName: 'Write' },
    { event: 'PreToolUse', toolUseId: 't2', toolName: 'Read' },
  ],
  events: [call('t1'), permission('t1'), result('t1'), call('t2', 'Read'), result('t2')],
  deniedFileExists: false,
  allowedFileExists: true,
  runError: null,
  ...over,
});

const verdict = (t: CompatTrace) =>
  Object.fromEntries(evaluateChecks(t, NATIVE).map((c) => [c.id, c.status]));

describe('a healthy ACP session', () => {
  it('passes every check', () => {
    expect(verdict(healthy())).toEqual({
      runs_installed_build: 'pass',
      hooks_before_first_tool: 'pass',
      acp_event_order: 'pass',
      permission_requests: 'pass',
      receipt_timing: 'pass',
      tool_schemas: 'pass',
    });
  });

  it('summarizes in one plain sentence', () => {
    const checks = evaluateChecks(healthy(), NATIVE);

    expect(summarize('2.1.299', checks)).toBe(
      'Build 2.1.299 passed all 6 compatibility checks.',
    );
  });
});

describe('each breakage fails the check that exists for it', () => {
  it('a different build ran than the installed one, or none reached the API', () => {
    expect(verdict(healthy({ runVersion: '2.1.293' })).runs_installed_build).toBe('fail');
    expect(verdict(healthy({ runVersion: null })).runs_installed_build).toBe('fail');
  });

  it('a tool call that reached the hook before the session start, or never', () => {
    const late = healthy({
      hooks: [{ event: 'PreToolUse', toolUseId: 't1' }, { event: 'SessionStart' }],
    });

    const never = healthy({ hooks: [{ event: 'SessionStart' }] });

    expect(verdict(late).hooks_before_first_tool).toBe('fail');
    expect(verdict(never).hooks_before_first_tool).toBe('fail');
  });

  it('a result or permission request before the call was announced', () => {
    expect(verdict(healthy({ events: [result('t1'), call('t1')] })).acp_event_order).toBe(
      'fail',
    );

    expect(
      verdict(healthy({ events: [permission('t1'), call('t1')] })).acp_event_order,
    ).toBe('fail');

    expect(verdict(healthy({ events: [] })).acp_event_order).toBe('fail');
  });

  it('no permission request at all, a denied call that ran, or an allowed call that did not', () => {
    expect(
      verdict(healthy({ events: [call('t1'), result('t1'), call('t2'), result('t2')] }))
        .permission_requests,
    ).toBe('fail');

    expect(verdict(healthy({ deniedFileExists: true })).permission_requests).toBe('fail');
    expect(verdict(healthy({ allowedFileExists: false })).permission_requests).toBe(
      'fail',
    );
  });

  it('a call whose id has no hook record, or a run the driver killed', () => {
    expect(
      verdict(healthy({ events: [call('zzz'), result('zzz')] })).receipt_timing,
    ).toBe('fail');

    const killed = {
      type: 'error',
      seq: 0,
      ...base,
      family: 'policy_denied',
      message: 'tool call t9 (Edit) has no server-side decision receipt',
    } as unknown as RunEvent;

    const checks = evaluateChecks(
      healthy({ events: [call('t1'), permission('t1'), result('t1'), killed] }),
      NATIVE,
    );

    expect(checks.find((c) => c.id === 'receipt_timing')).toMatchObject({
      status: 'fail',
      detail: expect.stringContaining('no server-side decision receipt'),
    });
  });

  it('a build that lacks a core tool, or sent no tool list', () => {
    const noEdit = healthy({
      captured: ['Read', 'Glob', 'Grep', 'Write', 'Bash'].map(tool),
    });

    expect(
      evaluateChecks(noEdit, NATIVE).find((c) => c.id === 'tool_schemas'),
    ).toMatchObject({
      status: 'fail',
      detail: expect.stringContaining('edit'),
    });

    expect(verdict(healthy({ captured: [] })).tool_schemas).toBe('fail');
  });

  it('accepts either shell name', () => {
    const power = healthy({
      captured: ['Read', 'Glob', 'Grep', 'Edit', 'Write', 'PowerShell'].map(tool),
    });

    expect(verdict(power).tool_schemas).toBe('pass');
  });

  it('a session that could not run fails every behaviour check with the reason', () => {
    const checks = evaluateChecks(healthy({ runError: 'no result after 180 s' }), NATIVE);

    expect(checks.filter((c) => c.status === 'fail').map((c) => c.id)).toEqual([
      'hooks_before_first_tool',
      'acp_event_order',
      'permission_requests',
      'receipt_timing',
    ]);

    expect(checks.find((c) => c.id === 'receipt_timing')?.detail).toContain(
      'no result after 180 s',
    );
  });

  it('names the first failure and says the harness is paused', () => {
    const checks = evaluateChecks(healthy({ deniedFileExists: true }), NATIVE);
    const sentence = summarize('2.1.300', checks);

    expect(sentence).toContain('Build 2.1.300 failed 1 of 6');
    expect(sentence).toContain('permission_requests');
    expect(sentence).toContain('paused');
  });
});

describe('the CLI engine', () => {
  it('skips the ACP event order check, which is neither a pass nor a failure', () => {
    const cli = healthy({
      engine: 'cli',
      events: [call('t1'), result('t1'), call('t2'), result('t2')],
    });

    const v = verdict(cli);

    expect(v.acp_event_order).toBe('skipped');
    expect(v.permission_requests).toBe('pass');
  });
});
