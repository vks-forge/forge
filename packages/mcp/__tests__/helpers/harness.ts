/**
 * Test harness for @forge/mcp: an in-memory run, ticket, token and MCP client.
 *
 * Why: every tool test needs the same realistic setup (a ticket, a running run with a
 *   registered token, a connected client) and should go through the real MCP protocol
 *   rather than call handlers directly, so the schemas, the run-active check and the
 *   error mapping are exercised exactly as a harness would see them. The run's token is
 *   registered through the same `runTokens` repository production uses (hash only).
 *
 * Exports: RUN_ID, TOKEN, TICKET_ID, T0, seedStorage(), connect(), textOf().
 * Depends on: @forge/core, @forge/db, @modelcontextprotocol/sdk, domain/run-tokens, domain/server.
 */

import type { ForgeMcpDeps } from '#/types/deps.types.js';
import { makeTicketId } from '@forge/core';
import type { Run, StorageAdapter, Ticket } from '@forge/core';
import { createMemoryStorage } from '@forge/db';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { hashToken } from '#/domain/run-tokens.js';
import { createForgeMcpServer } from '#/domain/server.js';

export const RUN_ID = 'run-1';
export const TOKEN = 'tok-correct-horse';
export const TICKET_ID = makeTicketId('SF', 1);
export const T0 = '2026-10-13T00:00:00.000Z';

export function ticket(n: number, over: Partial<Ticket> = {}): Ticket {
  return {
    id: makeTicketId('SF', n),
    project: 'SF',
    title: `Ticket ${n}`,
    body: `body ${n}`,
    type: 'feat',
    lane: 'standard',
    tier_predicted: 'A',
    status: 'in_progress',
    status_version: 1,
    rework_count: 0,
    created_at: T0,
    updated_at: T0,
    blocked_by: [],
    ...over,
  };
}

export function run(over: Partial<Run> = {}): Run {
  return {
    id: RUN_ID,
    ticket_id: TICKET_ID,
    harness: 'fake',
    driver_version: '0.0.0',
    cwd: '/tmp/work',
    lane: 'standard',
    started_at: T0,
    status: 'running',
    owner: 'server-1',
    ...over,
  };
}

/** Storage holding SF-1 (child of SF-9, blocked by SF-2), SF-2, SF-9, SF-5, a running run and its token hash. */
export async function seedStorage(): Promise<StorageAdapter> {
  const storage = createMemoryStorage();
  await storage.transaction(async (tx) => {
    await tx.tickets.insert(
      ticket(1, { parent: makeTicketId('SF', 9), blocked_by: [makeTicketId('SF', 2)] }),
    );
    await tx.tickets.insert(ticket(2, { status: 'done' }));
    await tx.tickets.insert(ticket(9));
    await tx.tickets.insert(ticket(5));
    await tx.runs.insert(run());
    await tx.runTokens.put(RUN_ID, hashToken(TOKEN), T0);
  });
  return storage;
}

export async function connect(
  over: Partial<ForgeMcpDeps> = {},
  storage?: StorageAdapter,
): Promise<{ client: Client; storage: StorageAdapter; close(): Promise<void> }> {
  const store = storage ?? (await seedStorage());
  const server = await createForgeMcpServer({
    storage: store,
    runId: RUN_ID,
    runToken: TOKEN,
    now: () => new Date(T0),
    // No real network in tests: a public-looking answer and a transport that must not be reached.
    resolve: async () => ['93.184.216.34'],
    transport: async () => {
      throw new Error('unexpected network access in test');
    },
    searchFetch: fetch,
    ...over,
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  return {
    client,
    storage: store,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

/** Joined text of a tool result's content blocks. */
export function textOf(result: unknown): string {
  const content = (result as { content?: { type: string; text?: string }[] }).content;
  return (content ?? []).map((c) => c.text ?? '').join('\n');
}
