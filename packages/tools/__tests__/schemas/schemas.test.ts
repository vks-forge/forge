/**
 * Pins the policy schemas that guard config and rows entering the tools package.
 *
 * Why: catalogue entries, grants, budgets and receipt rows come from yaml files and the
 * database; a malformed one must be rejected at the boundary, not discovered inside
 * `admit()`. The receipt schemas must also keep matching the `tool_decisions` /
 * `tool_effects` column names so rows persist without translation.
 *
 * Pins: ToolDefinition, Grant, CallRule, BudgetLimits, DecisionReceipt column names,
 * the `server_draining` reason code and its denial receipt.
 * Depends on: schemas/*, helpers/fixtures, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { BudgetLimits } from '#/schemas/budget.js';
import { Decision, ReasonCode } from '#/schemas/decision.js';
import { Grant } from '#/schemas/grant.js';
import { DecisionReceipt, EffectReceipt } from '#/schemas/receipt.js';
import { ToolDefinition } from '#/schemas/tool-definition.js';
import { nativeNames } from '#/domain/tool-id.js';
import { ENTRIES } from '#tests/helpers/fixtures.js';

describe('ToolDefinition', () => {
  it('accepts native and mcp ids and fills defaults', () => {
    const d = ToolDefinition.parse(ENTRIES[0]);
    expect(d).toMatchObject({
      reaches_tools: [],
      resources: [],
      cost_class: 'free',
      taints: false,
    });

    expect(ToolDefinition.safeParse(ENTRIES.at(-1)).success).toBe(true);
  });

  it.each([
    ['uppercase id', { id: 'Read' }],
    ['bad mcp id', { id: 'mcp__only' }],
    ['unknown risk', { risk: 'safe' }],
    ['bad schema hash', { schema_hash: 'abc' }],
    ['unknown enforcement', { support: { x: { mechanism: 'm', enforced: 'magic' } } }],
  ])('rejects %s', (_n, over) => {
    expect(ToolDefinition.safeParse({ ...ENTRIES[0], ...over }).success).toBe(false);
  });
});

describe('HarnessSupport.native', () => {
  const withNative = (native: unknown) => ({
    ...ENTRIES[0],
    support: { 'claude-code': { native, mechanism: 'allow-flag', enforced: 'harness' } },
  });

  it('accepts one name or a list of names', () => {
    expect(ToolDefinition.safeParse(withNative('Bash')).success).toBe(true);
    expect(ToolDefinition.safeParse(withNative(['Bash', 'PowerShell'])).success).toBe(
      true,
    );
  });

  it.each([[[]], [['']], [''], [[1]]])('rejects %j', (native) => {
    expect(ToolDefinition.safeParse(withNative(native)).success).toBe(false);
  });

  it('nativeNames normalises to a list; absent means none', () => {
    const base = { mechanism: 'm', enforced: 'harness' } as const;
    expect(nativeNames({ ...base, native: 'Bash' })).toEqual(['Bash']);
    expect(nativeNames({ ...base, native: ['Bash', 'PowerShell'] })).toEqual([
      'Bash',
      'PowerShell',
    ]);

    expect(nativeNames(base)).toEqual([]);
    expect(nativeNames(undefined)).toEqual([]);
  });
});

describe('Grant and BudgetLimits', () => {
  it('defaults deny and rules, leaves allow undefined', () => {
    expect(Grant.parse({})).toEqual({ deny: [], rules: [] });
    expect(BudgetLimits.parse({})).toEqual({ run: {}, per_tool: {} });
  });

  it('rejects unknown effects and negative budgets', () => {
    expect(
      Grant.safeParse({ rules: [{ action: 'a', resource: 'b', effect: 'maybe' }] })
        .success,
    ).toBe(false);

    expect(BudgetLimits.safeParse({ run: { max_usd: -1 } }).success).toBe(false);
  });
});

describe('receipt rows mirror the db tables', () => {
  it('uses the tool_decisions and tool_effects column names', () => {
    expect(Object.keys(DecisionReceipt.shape)).toEqual(
      expect.arrayContaining([
        'id',
        'run_id',
        'seq',
        'tool',
        'version',
        'schema_hash',
        'args_hash',
        'decision',
        'layer',
        'rule_id',
        'resource',
        'finding_ids',
        'approver',
        'approval_ref',
        'enforced_by',
        'ts',
        'prev_hash',
        'hash',
      ]),
    );

    expect(Object.keys(EffectReceipt.shape)).toEqual(
      expect.arrayContaining([
        'decision_id',
        'state',
        'result_hash',
        'result_ref',
        'duration_ms',
        'cost_usd',
        'checkpoint_ref',
        'ts',
        'prev_hash',
        'hash',
      ]),
    );
  });
});

describe('server_draining', () => {
  it('is a valid ReasonCode and a valid deny Decision', () => {
    expect(ReasonCode.safeParse('server_draining').success).toBe(true);

    const decision = {
      decision: 'deny',
      reason: 'server_draining',
      enforced_by: 'forge_admit',
      enforcement: null,
      layer: 'hook',
      matched_rule: null,
      finding_ids: [],
      tool: 'Edit',
    };

    expect(Decision.safeParse(decision).success).toBe(true);
  });

  it('parses as a decision receipt, so G1 finds the refused call in the chain', () => {
    const hex = 'a'.repeat(64);
    const receipt = {
      kind: 'decision',
      id: 'u1',
      run_id: 'r1',
      seq: 1,
      tool: 'Edit',
      version: null,
      schema_hash: null,
      args_hash: hex,
      decision: 'deny',
      layer: 'hook',
      reason: 'server_draining',
      rule_id: null,
      resource: null,
      finding_ids: [],
      approver: null,
      approval_ref: null,
      enforced_by: null,
      ts: '2026-10-15T00:00:00.000Z',
      prev_hash: null,
      hash: hex,
    };

    expect(DecisionReceipt.safeParse(receipt).success).toBe(true);
  });
});
