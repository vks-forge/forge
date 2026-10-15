/**
 * Pins: the chat adapter passes the TriggerAdapter contract (so does a fake polled adapter,
 * which keeps the contract's polled branch honest), and chat-specific rules: it refuses an
 * event claiming another source, and is push-only.
 *
 * Why: chat is the one door users type into; if it accepted `source: webhook` a chat client
 * could impersonate a source with different trust, and if redelivery changed the dedupe key a
 * double-click would create two tickets.
 *
 * Depends on: contract/trigger-adapter.contract, helpers/fake-polled-trigger, src/index.
 */

import { IntakeEvent } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { createChatTrigger } from '#/index.js';
import { describeTriggerAdapterContract } from '#tests/contract/trigger-adapter.contract.js';
import { createFakePolledTrigger } from '#tests/helpers/fake-polled-trigger.js';

const chat = {
  source: 'chat',
  kind: 'new_request',
  dedupe_key: 'msg-1',
  actor: { type: 'user', id: 'vikash' },
  project: 'SF',
  payload: { text: 'add a health endpoint' },
  received_at: '2026-10-15T00:00:00.000Z',
};

const issue = { ...chat, source: 'github_issue', dedupe_key: 'issue-7' };

describeTriggerAdapterContract('chat', createChatTrigger, {
  valid: chat,
  redelivery: { ...chat },
  invalid: [
    null,
    'hello',
    {},
    { ...chat, dedupe_key: '' },
    { ...chat, source: 'carrier-pigeon' },
    { ...chat, received_at: 'yesterday' },
  ],
});

describeTriggerAdapterContract(
  'fake polled',
  () => createFakePolledTrigger([IntakeEvent.parse(issue)]),
  {
    valid: issue,
    redelivery: { ...issue },
    invalid: [{}, { ...issue, project: '' }, chat],
  },
);

describe('chat trigger', () => {
  it('refuses an event that claims another source', () => {
    expect(() => createChatTrigger().normalise({ ...chat, source: 'webhook' })).toThrow(
      /source/,
    );
  });

  it('is push only and carries the author when the client sets one', () => {
    const adapter = createChatTrigger();
    const event = adapter.normalise({
      ...chat,
      author: { kind: 'user', login: 'vikash' },
    });

    expect(adapter.capabilities()).toEqual({ push: true, poll: false });
    expect(event.author).toEqual({ kind: 'user', login: 'vikash' });
  });
});
