/**
 * Schema hashes of the Forge tools as a harness sees them.
 *
 * Why: the catalogue pins a hash per tool so a tool whose schema changes after review
 *   loses trust until re-reviewed. The hash must be computed from what the MCP server
 *   really advertises (`tools/list`), not from source text, so the SDK's zod-to-JSON
 *   conversion is part of what is pinned. The same function serves the signer script
 *   and the drift test, and a driver can reuse `toolSchemaHash` on a live `tools/list`.
 *
 * Exports: toolSchemaHash(), computeToolSchemaHashes().
 * Depends on: node:crypto, @modelcontextprotocol/sdk, domain/server. IO: none (in-memory transport).
 */

import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createForgeMcpServer, SERVER_NAME } from '#/domain/server.js';
import { hashToken } from '#/domain/run-tokens.js';

function canonical(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v !== null && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

/** `sha256:<hex>` over the tool's name and advertised input JSON schema. */
export function toolSchemaHash(tool: { name: string; inputSchema: unknown }): string {
  const digest = createHash('sha256')
    .update(canonical({ name: tool.name, inputSchema: tool.inputSchema }))
    .digest('hex');
  return `sha256:${digest}`;
}

/** Map of `mcp__forge__<tool>` to schema hash, from a throwaway in-memory server. */
export async function computeToolSchemaHashes(): Promise<Record<string, string>> {
  const storage = {
    transaction: async <T>(fn: (tx: never) => Promise<T>) =>
      fn({
        runs: { get: async () => ({ id: 'probe', status: 'running' }) },
        runTokens: { getHash: async () => hashToken('probe') },
      } as never),
    close: async () => undefined,
  };
  const server = await createForgeMcpServer({
    storage: storage as never,
    runId: 'probe',
    runToken: 'probe',
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'schema-hash', version: '0.0.0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  try {
    const { tools } = await client.listTools();
    return Object.fromEntries(
      tools.map((t) => [`mcp__${SERVER_NAME}__${t.name}`, toolSchemaHash(t)]),
    );
  } finally {
    await client.close();
    await server.close();
  }
}
