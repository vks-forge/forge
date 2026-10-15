/**
 * The scripted stand-in for the model API plays the script and records what the harness sent.
 *
 * Why: the compatibility check is only as honest as its model. If the stand-in replayed the
 * wrong step, ended the conversation early or lost the tool list, a healthy build would fail
 * the check or a broken one pass. These tests talk to it the way a harness does: a request that
 * offers tools, then requests that carry tool results.
 *
 * Pins: first-request tool capture, scripted steps in order then a plain reply, names chosen
 * from what the build offers, version from the user agent, requests without tools get a reply.
 * Depends on: src/compat/fake-model-api. IO: a loopback HTTP server.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { parseUserAgentVersion, startFakeModelApi } from '#/compat/fake-model-api.js';
import type { FakeModelApi } from '#/types/compat/compat.types.js';

let api: FakeModelApi | undefined;
afterEach(async () => {
  await api?.close();
  api = undefined;
});

const post = async (
  url: string,
  body: unknown,
  agent = 'claude-cli/2.1.299 (external, cli)',
) =>
  (
    await fetch(`${url}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': agent },
      body: JSON.stringify(body),
    })
  ).text();

const tools = [
  { name: 'Read', input_schema: { type: 'object' } },
  { name: 'Bash', input_schema: { type: 'object', title: 'b' } },
];

describe('startFakeModelApi', () => {
  it('captures the offered tools and the build from the first request that offers any', async () => {
    api = await startFakeModelApi(() => []);
    await post(api.baseUrl, { messages: [] });
    expect(api.captured()).toEqual([]);
    expect(api.version()).toBeNull();

    await post(api.baseUrl, { tools, messages: [] });
    await post(
      api.baseUrl,
      { tools: [{ name: 'Other' }], messages: [], x: 1 },
      'claude-cli/9.9.9',
    );

    expect(api.captured().map((t) => t.name)).toEqual(['Read', 'Bash']);
    expect(api.captured()[1]?.input_schema).toEqual({ type: 'object', title: 'b' });
    expect(api.version()).toBe('2.1.299');
  });

  it('plays the scripted calls in order, then a plain reply, choosing a name the build offers', async () => {
    api = await startFakeModelApi((offered) => {
      expect(offered.has('Bash')).toBe(true);

      return [
        { names: ['Read'], input: { file_path: 'a' } },
        { names: ['PowerShell', 'Bash'], input: { command: 'echo' } },
        { names: ['NotOffered'], input: {} },
      ];
    });

    const first = await post(api.baseUrl, {
      tools,
      messages: [{ role: 'user', content: 'go' }],
    });

    const results = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: `t${i}` }],
      }));

    const second = await post(api.baseUrl, { tools, messages: results(1) });
    const third = await post(api.baseUrl, { tools, messages: results(2) });

    expect(first).toContain('"name":"Read"');
    expect(first).toContain('"stop_reason":"tool_use"');
    expect(first).toContain(
      JSON.stringify(JSON.stringify({ file_path: 'a' })).slice(1, -1),
    );

    expect(second).toContain('"name":"Bash"');
    expect(third).toContain('"stop_reason":"end_turn"');
  });
});

describe('parseUserAgentVersion', () => {
  it('reads the build and refuses anything else', () => {
    expect(parseUserAgentVersion('claude-cli/2.1.299 (external, cli)')).toBe('2.1.299');
    expect(parseUserAgentVersion('node')).toBeNull();
    expect(parseUserAgentVersion(undefined)).toBeNull();
  });
});
