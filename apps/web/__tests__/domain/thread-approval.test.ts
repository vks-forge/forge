/**
 * Pins: a `permission` run event that waits on the owner becomes a thread line that names the
 * call (its command, path or address, else the tool) and carries the interaction to open; an
 * event with no interaction adds nothing of the kind.
 *
 * Why: the owner watching a Worker thread must be able to tell which call is waiting for them and
 *   reach its approval in one click, even when the harness announced the call before the
 *   permission event. Pure.
 * Depends on: src/domain/thread.
 */

import type { RunEvent } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { applyEvents, EMPTY_THREAD } from '#/domain/thread.js';

const ev = (seq: number, rest: Record<string, unknown>): RunEvent =>
  ({ seq, ts: '2026-10-16T10:00:00.000Z', ...rest }) as RunEvent;

describe('applyEvent: a call waiting for the owner', () => {
  const call = ev(1, {
    type: 'tool_call',
    call_id: 'c1',
    name: 'Bash',
    input: { command: 'make install-deps' },
  });

  it('names the command and the item to open on a permission ask', () => {
    const state = applyEvents(EMPTY_THREAD, [
      call,
      ev(2, {
        type: 'permission',
        call_id: 'c1',
        tool: 'Bash',
        decision: 'ask',
        interaction_id: 'int-p1',
      }),
    ]);

    expect(state.items[1]).toMatchObject({
      kind: 'decision',
      decision: 'ask',
      interactionId: 'int-p1',
      what: 'make install-deps',
    });
  });

  it('falls back to the tool name when the call was not seen, and adds nothing without an item', () => {
    const state = applyEvents(EMPTY_THREAD, [
      ev(2, {
        type: 'permission',
        call_id: 'gone',
        tool: 'Bash',
        decision: 'ask',
        interaction_id: 'int-p2',
      }),
      ev(3, { type: 'permission', call_id: 'gone', tool: 'Bash', decision: 'allow' }),
    ]);

    expect(state.items[0]).toMatchObject({ what: 'Bash' });
    expect(state.items[1]).not.toHaveProperty('interactionId');
  });
});
