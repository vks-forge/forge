/**
 * A local stand-in for the model API that drives a scripted tool-calling session.
 *
 * Why: to check a harness build Forge must watch it call tools, and must read the tool
 *   schemas the build sends to the model. A real model would make that slow, paid and
 *   different on every run. The harness lets its API endpoint be set, so this server plays
 *   the model: it records the tool list of the first request (the exact schemas, the only
 *   place they are visible), then answers each turn with the next scripted tool call and
 *   finally a plain reply. The harness announces its own version in the request's user
 *   agent, which is how the check proves it exercised the installed build and not some
 *   bundled copy (d-0101). Nothing leaves the machine and nothing is billed.
 *
 * Exports: startFakeModelApi(), parseUserAgentVersion().
 * Depends on: node:http, types/compat. IO: binds an ephemeral port on 127.0.0.1.
 */

import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type {
  CapturedTool,
  FakeModelApi,
  MessagesBody,
  ScriptedCall,
  SseEvent,
} from '#/types/compat/compat.types.js';

const MODEL = 'claude-compat-fake';

/** `claude-cli/2.1.299 (external, cli)` gives `2.1.299`; null when the header is absent or odd. */
export function parseUserAgentVersion(agent: string | undefined): string | null {
  return /claude-cli\/(\d+\.\d+\.\d+)/.exec(agent ?? '')?.[1] ?? null;
}

const sse = (events: readonly SseEvent[]): string =>
  events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');

const start = (id: string) => ({
  type: 'message_start',
  message: {
    id,
    type: 'message',
    role: 'assistant',
    model: MODEL,
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  },
});

function toolTurn(step: number, name: string, input: unknown): string {
  return sse([
    start(`msg_compat_${step}`),
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: `toolu_compat_${step}`, name, input: {} },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) },
    },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'tool_use', stop_sequence: null },
      usage: { output_tokens: 5 },
    },
    { type: 'message_stop' },
  ]);
}

function textTurn(text: string): string {
  return sse([
    start('msg_compat_text'),
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 2 },
    },
    { type: 'message_stop' },
  ]);
}

/** Number of tool results the conversation already holds: which scripted step is next. */
const resultsIn = (messages: unknown): number =>
  JSON.stringify(messages ?? []).split('"type":"tool_result"').length - 1;

/**
 * Starts the server. `script(offered)` is called once, on the first request that offers
 * tools, with the tool names offered, and returns the calls to make in order.
 */
export async function startFakeModelApi(
  script: (offered: ReadonlySet<string>) => readonly ScriptedCall[],
): Promise<FakeModelApi> {
  let captured: CapturedTool[] = [];
  let version: string | null = null;
  let steps: { name: string; input: unknown }[] | null = null;

  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c: Buffer) => (raw += c.toString('utf8')));
    req.on('end', () => {
      let body: MessagesBody = {};
      try {
        body = JSON.parse(raw) as MessagesBody;
      } catch {
        // Health checks and non-JSON probes get the plain reply below.
      }

      const tools = Array.isArray(body.tools) ? body.tools : [];
      const main = tools.length > 0;
      res.writeHead(200, { 'content-type': 'text/event-stream' });

      if (!main) {
        res.end(textTurn('ok'));

        return;
      }

      if (steps === null) {
        captured = tools.flatMap((t) =>
          typeof t.name === 'string'
            ? [{ name: t.name, input_schema: t.input_schema }]
            : [],
        );

        version = parseUserAgentVersion(req.headers['user-agent']);
        const offered = new Set(captured.map((t) => t.name));
        steps = script(offered).flatMap((c) => {
          const name = c.names.find((n) => offered.has(n));

          return name === undefined ? [] : [{ name, input: c.input }];
        });
      }

      const step = resultsIn(body.messages);
      const next = steps[step];
      res.end(next ? toolTurn(step, next.name, next.input) : textTurn('compat done'));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    captured: () => captured,
    version: () => version,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
