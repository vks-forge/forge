/**
 * What any harness does toward the Forge server during a run: hooks, tool calls, MCP.
 *
 * Why: the fake Worker and the live-probe assertions need the same three moves, done the
 *   way Claude Code does them. `hook` posts an event to the real `POST /runs/:id/hook` with
 *   the run's bearer token; `tool` wraps one tool call in `PreToolUse` and `PostToolUse`,
 *   emits the matching `tool_call` / `tool_result` events and performs the effect only when
 *   the hook answered `allow` (a denied call has no effect, like a real harness); `mcp`
 *   calls a tool of the real Forge MCP server (`createForgeMcpServer`, the code `apps/mcp`
 *   serves on stdio) over an in-memory transport, authenticated with the run token.
 *
 * Exports: HarnessSession, createHarnessSession().
 * Depends on: @forge/core, @forge/drivers (PreparedRun type), @forge/mcp, @modelcontextprotocol/sdk.
 *   IO: HTTP to the server, in-memory MCP transport.
 */

import type { RunRequest, StorageAdapter } from '@forge/core';
import type { PreparedRun } from '@forge/drivers';
import { createForgeMcpServer } from '@forge/mcp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

export interface HarnessSession {
  hook(
    event: string,
    payload: Record<string, unknown>,
  ): Promise<{ decision: string; reason: string }>;
  /** One tool call: hook, event, effect (only if allowed), hook. Returns the effect's output, or null when denied. */
  tool(
    name: string,
    input: Record<string, unknown>,
    perform: () => Promise<unknown> | unknown,
  ): Promise<unknown>;
  /** Calls a Forge MCP tool (`finish`, `ask_director`) on the real MCP server. */
  mcp(name: string, args: Record<string, unknown>): Promise<unknown>;
}

export function createHarnessSession(
  req: RunRequest,
  prepared: PreparedRun,
  storage: () => StorageAdapter,
  emit: (event: Record<string, unknown>) => void,
): HarnessSession {
  let counter = 0;

  const hook: HarnessSession['hook'] = async (event, payload) => {
    const res = await fetch(`${prepared.hookServerUrl}/runs/${req.runId}/hook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${prepared.hookToken}`,
      },
      body: JSON.stringify({
        event,
        payload: {
          hook_event_name: event,
          session_id: `sess-${req.runId}`,
          ...payload,
        },
        seq: Date.now(),
      }),
    });

    return (await res.json()) as { decision: string; reason: string };
  };

  return {
    hook,
    async tool(name, input, perform) {
      // The generation keeps ids unique across a resume, as a real harness's are.
      const id = `toolu_${req.runId}_g${req.generation ?? 1}_${++counter}`;
      const base = { tool_name: name, tool_input: input, tool_use_id: id };
      const verdict = await hook('PreToolUse', base);
      emit({ type: 'tool_call', call_id: id, name, input });
      if (verdict.decision !== 'allow') {
        emit({
          type: 'tool_result',
          call_id: id,
          output: verdict.reason,
          is_error: true,
        });

        return null;
      }

      const output = await perform();
      await hook('PostToolUse', { ...base, tool_response: { output } });
      emit({
        type: 'tool_result',
        call_id: id,
        output: String(output ?? ''),
        is_error: false,
      });

      return output;
    },
    async mcp(name, args) {
      const server = await createForgeMcpServer({
        storage: storage(),
        runId: req.runId,
        runToken: prepared.hookToken,
      });

      const [a, b] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: 'fake-worker', version: '0.0.0' });
      await Promise.all([server.connect(a), client.connect(b)]);
      try {
        return await client.callTool({ name, arguments: args });
      } finally {
        await client.close();
        await server.close();
      }
    },
  };
}
