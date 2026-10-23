/**
 * Fixture for a tool approval as the server sends it: a Worker's call waiting on the owner.
 *
 * Why: the permission card, the dock, the Inbox and the settings tab all read the same payload
 *   (exact command, the Worker's reason, the rule that asked, what "Always" would keep), so every
 *   test builds it from one shape that follows core's `EscalationPermission` (d-0175).
 *
 * Exports: permissionView().
 * Depends on: helpers/escalation-world (shape of an escalation view). No IO.
 */

import { escalationBase } from '#tests/helpers/escalation-world.js';

type Raw = Record<string, unknown>;

/** A tool call waiting for the owner (d-0175): the exact command, the Worker's reason, three answers. */
export function permissionView(over: Raw = {}): Raw {
  return escalationBase({
    id: 'int-p1',
    kind: 'permission',
    payload: {
      kind: 'permission',
      tool: 'Bash',
      action: 'shell',
      what: 'make install-deps',
      approval_key: 'key-1',
      reason_code: 'rule_ask',
      why: 'The report needs the database client.',
      lane: 'full',
      always: {
        offered: true,
        rule: { action: 'shell', resource: 'make install-deps' },
      },
      summary: 'Allow `make install-deps`?',
    },
    actions: ['allow_once', 'allow_always', 'deny'],
    ...over,
  });
}
