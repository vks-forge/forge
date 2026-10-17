/**
 * Pins: acting on an escalation invalidates every view of it (the ticket, the lists, the card and
 * its escalation list, the Inbox); a simple choice settles the cached card list at once and puts
 * it back if the server refuses; a choice that opens a dialog (cancel) is not shown settled before
 * the server agrees.
 *
 * Why: one escalation shows in the chat, on the Ticket page and in the Inbox. If a click left one
 *   of those caches stale the owner would be asked the same thing twice; if a refused click stayed
 *   settled on screen they would believe something was done that was not.
 * Depends on: api/use-escalations, api/http/http-adapter via components/app-providers,
 *   helpers/escalation-world, helpers/fetch-stub.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { createHttpAdapter } from '#/api/http/http-adapter.js';
import { ApiProvider } from '#/api/api-provider.js';
import { cardEscalationsKey, useActOnEscalation } from '#/api/use-escalations.js';
import { EscalationView } from '#/schemas/escalation.js';
import type { EscalationList } from '#/schemas/escalation.js';
import { escalationWorld, questionView } from '#tests/helpers/escalation-world.js';
import { stubFetch } from '#tests/helpers/fetch-stub.js';

const VIEW = EscalationView.parse(questionView());

function setup(options: Parameters<typeof escalationWorld>[1] = {}) {
  const world = escalationWorld([questionView()], options);
  const stub = stubFetch(world.routes);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ApiProvider api={createHttpAdapter({ baseUrl: '/api' })}>{children}</ApiProvider>
    </QueryClientProvider>
  );

  return { world, stub, client, wrapper };
}

const KEYS = [
  ['ticket', 'SVC-4'],
  ['tickets', 'sample-service'],
  ['cards', 'sample-service'],
  ['card', 'FG-C9'],
  ['inbox', 'sample-service', 'list', 'needs_action'],
] as const;

describe('useActOnEscalation', () => {
  it('invalidates the ticket, the lists, the card and the Inbox after an act', async () => {
    const { client, wrapper } = setup();
    for (const key of KEYS) {
      client.setQueryData([...key], { seeded: true });
    }

    const { result } = renderHook(() => useActOnEscalation(VIEW), { wrapper });
    act(() => result.current.mutate({ action: 'retry' }));
    await waitFor(() => {
      for (const key of KEYS) {
        expect(client.getQueryState([...key])?.isInvalidated).toBe(true);
      }
    });
  });

  it('marks the cached card list settled at once and puts it back when the server refuses', async () => {
    const { world, client, wrapper } = setup();
    const list: EscalationList = { items: [VIEW] };
    client.setQueryData(cardEscalationsKey('FG-C9'), list);
    world.settleElsewhere('int-q1');

    const { result } = renderHook(() => useActOnEscalation(VIEW), { wrapper });
    const seen: (string | undefined)[] = [];
    const unsubscribe = client.getQueryCache().subscribe(() => {
      const held = client.getQueryData<EscalationList>(cardEscalationsKey('FG-C9'));
      seen.push(held?.items[0]?.settled?.by);
    });

    act(() => result.current.mutate({ action: 'answer', text: 'UTC' }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    unsubscribe();

    expect(seen).toContain('owner');
    expect(
      client.getQueryData<EscalationList>(cardEscalationsKey('FG-C9'))?.items[0]?.settled,
    ).toBeUndefined();
  });

  it('does not show a cancel as settled before the server agrees', async () => {
    const { client, wrapper } = setup({ dependents: ['SVC-5'] });
    client.setQueryData(cardEscalationsKey('FG-C9'), { items: [VIEW] });

    const { result } = renderHook(() => useActOnEscalation(VIEW), { wrapper });
    act(() => result.current.mutate({ action: 'cancel' }));
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(
      client.getQueryData<EscalationList>(cardEscalationsKey('FG-C9'))?.items[0]?.settled,
    ).toBeUndefined();
  });
});
