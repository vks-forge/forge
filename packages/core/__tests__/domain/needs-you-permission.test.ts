/**
 * Tests for a tool approval as a Needs-you item and its owner actions.
 *
 * Why: a Standard or Full Worker whose call needs approval parks the ticket with one item per
 *   call. The owner must see the exact command in the title, the Worker's reason and the
 *   rule that asked, and get Allow once / Always / Deny, with Always hidden when no narrow
 *   rule can be stored (a protected path, a chain, a banned command). A long command must
 *   not break the dock row, and the schema must refuse a payload without its key, which is
 *   what binds an answer to one call.
 *
 * Pins: escalationItem() kind, title and items for `permission`; escalationActions() with and
 *   without "always"; EscalationPermission, the act bodies and EscalationAnswer.settings_version;
 *   ToolGrantConfig.approved.
 * Depends on: src/domain/needs-you, src/domain/escalation-actions, src/schemas/escalation,
 *   src/schemas/project, helpers/escalation-payloads, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { escalationActions } from '#/domain/escalation-actions.js';
import { escalationItem } from '#/domain/needs-you.js';
import { NEEDS_YOU_TITLE_MAX } from '#/schemas/card-event.js';
import {
  EscalationActBody,
  EscalationAnswer,
  EscalationPayload,
  EscalationView,
} from '#/schemas/escalation.js';
import { ToolGrantConfig } from '#/schemas/project.js';
import { permissionPayload } from '#tests/helpers/escalation-payloads.js';

const AT = '2026-10-20T10:00:00.000Z';

const view = (always: boolean, what?: string): EscalationView => {
  const payload = permissionPayload(always);
  const shown = what === undefined ? payload : { ...payload, what };

  return {
    id: 'int-1',
    ticket_id: 'FG-7',
    ticket_title: 'Add login',
    kind: 'permission',
    stage: 'owner',
    status: 'pending',
    payload: shown,
    actions: escalationActions(shown, { replannable: true }),
    asked_at: AT,
  } as EscalationView;
};

describe('permission as a Needs-you item', () => {
  it('names the exact command in the title and gives the Worker reason then the rule', () => {
    expect(escalationItem(view(true))).toMatchObject({
      kind: 'tool_approval',
      title: 'Allow `cargo add serde`?',
      items: [
        'The task needs serde for JSON.',
        'Installing a dependency needs approval in the Standard lane.',
      ],
      actions: ['allow_once', 'allow_always', 'deny'],
      ticket_id: 'FG-7',
      interaction_id: 'int-1',
    });
  });

  it('shows only the rule when the Worker gave no reason', () => {
    const v = view(true);
    const payload: Record<string, unknown> = { ...v.payload };
    delete payload['why'];

    const item = escalationItem({ ...v, payload } as EscalationView);

    expect(item?.items).toEqual([
      'Installing a dependency needs approval in the Standard lane.',
    ]);
  });

  it('keeps a very long command to one dock row', () => {
    const item = escalationItem(view(true, `go get ${'x'.repeat(500)}`));

    expect(item?.title.length).toBeLessThanOrEqual(NEEDS_YOU_TITLE_MAX);
  });
});

describe('permission actions', () => {
  it('offers allow once, always and deny, in that order', () => {
    expect(escalationActions(permissionPayload(true), { replannable: true })).toEqual([
      'allow_once',
      'allow_always',
      'deny',
    ]);
  });

  it('hides always when no narrow rule is offered', () => {
    expect(escalationActions(permissionPayload(false), { replannable: false })).toEqual([
      'allow_once',
      'deny',
    ]);
  });
});

describe('permission schemas', () => {
  it('parses a permission payload and rejects one without its key or with a huge command', () => {
    const ok = permissionPayload(true);

    expect(EscalationPayload.safeParse(ok).success).toBe(true);
    expect(EscalationPayload.safeParse({ ...ok, approval_key: '' }).success).toBe(false);
    expect(EscalationPayload.safeParse({ ...ok, what: 'x'.repeat(2001) }).success).toBe(
      false,
    );

    expect(EscalationPayload.safeParse({ ...ok, why: 'y'.repeat(301) }).success).toBe(
      false,
    );
  });

  it('accepts the three owner actions, with an optional note only on deny', () => {
    expect(EscalationActBody.parse({ action: 'allow_once' })).toEqual({
      action: 'allow_once',
    });

    expect(EscalationActBody.parse({ action: 'allow_always' })).toEqual({
      action: 'allow_always',
    });

    expect(EscalationActBody.parse({ action: 'deny', note: ' not now ' })).toEqual({
      action: 'deny',
      note: 'not now',
    });

    expect(EscalationActBody.parse({ action: 'deny' })).toEqual({ action: 'deny' });
  });

  it('records the settings version on an answer', () => {
    expect(
      EscalationAnswer.parse({
        action: 'allow_always',
        by: 'owner',
        settings_version: 4,
      }),
    ).toMatchObject({ settings_version: 4 });

    expect(
      EscalationAnswer.safeParse({
        action: 'allow_always',
        by: 'owner',
        settings_version: 0,
      }).success,
    ).toBe(false);
  });
});

describe('ToolGrantConfig.approved', () => {
  const rule = {
    id: 'a1',
    action: 'shell',
    resource: 'cargo add serde',
    effect: 'allow',
    created_at: AT,
    source: { ticket_id: 'FG-7', interaction_id: 'int-1' },
  };

  it('defaults to none and keeps allow rules with their source', () => {
    expect(ToolGrantConfig.parse({}).approved).toEqual([]);
    expect(ToolGrantConfig.parse({ approved: [rule] }).approved).toEqual([rule]);
  });

  it('refuses anything but an allow', () => {
    expect(
      ToolGrantConfig.safeParse({ approved: [{ ...rule, effect: 'ask' }] }).success,
    ).toBe(false);
  });
});
