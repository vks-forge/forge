/**
 * The trigger registry.
 *
 * Why: the registry is what keeps an unregistered source out of intake, so it must route by
 *   source, refuse two adapters for one source or id (a second adapter would silently shadow
 *   the first's trust rules), and refuse an adapter whose capabilities do not match what it
 *   implements, at registration rather than at the first missed poll.
 *
 * Pins: lookup by source, polled() filter, duplicate id, duplicate source, capability lies.
 * Depends on: src/services/trigger-registry, @forge/triggers. No IO.
 */

import { InvalidInputError } from '@forge/core';
import type { TriggerAdapter } from '@forge/core';
import { createChatTrigger } from '@forge/triggers';
import { describe, expect, it } from 'vitest';
import { createTriggerRegistry } from '#/services/trigger-registry.js';
import { fakePolledTrigger } from '#tests/helpers/fake-polled-trigger.js';

describe('createTriggerRegistry', () => {
  it('finds an adapter by the source it owns and nothing else', () => {
    const chat = createChatTrigger();
    const registry = createTriggerRegistry([chat]);

    expect(registry.forSource('chat')).toBe(chat);
    expect(registry.forSource('webhook')).toBeUndefined();
    expect(registry.list()).toEqual([chat]);
  });

  it('lists only polling adapters in polled()', () => {
    const polled = fakePolledTrigger();
    const registry = createTriggerRegistry([createChatTrigger(), polled]);

    expect(registry.polled()).toEqual([polled]);
  });

  it('refuses a second adapter with the same id or the same source', () => {
    const registry = createTriggerRegistry([createChatTrigger()]);

    expect(() => registry.register(createChatTrigger())).toThrow(InvalidInputError);
    expect(() => registry.register({ ...createChatTrigger(), id: 'chat-2' })).toThrow(
      /already belongs/,
    );
  });

  it('refuses an adapter that cannot push or poll, or that declares poll without poll()', () => {
    const registry = createTriggerRegistry();
    const idle: TriggerAdapter = {
      ...createChatTrigger(),
      id: 'idle',
      source: 'cron',
      capabilities: () => ({ push: false, poll: false }),
    };

    const liar: TriggerAdapter = {
      ...createChatTrigger(),
      id: 'liar',
      source: 'telemetry',
      capabilities: () => ({ push: false, poll: true }),
    };

    expect(() => registry.register(idle)).toThrow(/neither/);
    expect(() => registry.register(liar)).toThrow(/no poll/);
    expect(registry.list()).toEqual([]);
  });
});
