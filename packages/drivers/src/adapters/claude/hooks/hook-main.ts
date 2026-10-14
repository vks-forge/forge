/**
 * Hook client: the script the harness runs on every SessionStart / tool event.
 *
 * Why: this is the chokepoint between a Worker's harness and Forge. The harness execs
 *   `node bin/hook.js`, feeds the event on stdin and obeys the exit code. The hook posts
 *   the raw event to the Forge server (which runs `admit()` and writes the signed
 *   receipt), then maps the answer to an exit code. It fails closed: a dead server, a
 *   missing token file, a garbled answer or a timeout all exit 2, because Claude Code's
 *   own default on hook failure is to let the tool run (d-0033, probe 2). The one
 *   exception is PostToolUse*, which cannot undo anything and only logs. A tool output over 1 MiB is
 *   replaced by a prefix plus the hash of the whole before posting, so a big file read
 *   cannot exceed the server's body limit and turn into a blocked tool. The run secret
 *   is never here; the hook holds only a bearer token.
 *
 * Exports: boundOutput(), runHook(), readStream(), main().
 * Depends on: @forge/tools/hook-wire (wire schemas only, so the process starts fast),
 *   hooks/decision-outcome, hooks/hook-config-file, schemas/claude-hook-config,
 *   types/claude/hook-client. IO: stdin, stderr, one HTTP call.
 */

import { readFile } from 'node:fs/promises';
import { loadHookConfig } from '#/adapters/claude/hooks/hook-config-file.js';
import { failClosed, fromResponse } from '#/adapters/claude/hooks/decision-outcome.js';
import { createHash } from 'node:crypto';
import {
  HookPayload,
  HookResponse,
  MAX_TOOL_OUTPUT_BYTES,
  TRUNCATED_PREFIX_BYTES,
} from '@forge/tools/hook-wire';
import type { TruncatedOutput } from '@forge/tools/hook-wire';
import type { HookConfig } from '#/schemas/claude-hook-config.js';
import type {
  HookIo,
  HookProcess,
  HookResult,
} from '#/types/claude/hook-client.types.js';

const STDIN_TIMEOUT_MS = 5_000;

/** Reads the event name from raw stdin without trusting the rest, to pick block vs log. */
function peekEvent(stdin: string): string | undefined {
  try {
    const v: unknown = JSON.parse(stdin);
    if (v !== null && typeof v === 'object' && 'hook_event_name' in v) {
      const name = (v as { hook_event_name: unknown }).hook_event_name;

      return typeof name === 'string' ? name : undefined;
    }
  } catch {
    // unparsable stdin is treated as a blocking event
  }

  return undefined;
}

/**
 * Replaces an oversized tool output with a bounded prefix plus the hash of the whole, so
 * the request stays small (a file read can be tens of MiB) and the server's effect receipt
 * still binds the full output.
 */
export function boundOutput(value: unknown): unknown {
  if (value === undefined) {
    return value;
  }

  const json = JSON.stringify(value) ?? 'null';
  const bytes = Buffer.byteLength(json, 'utf8');
  if (bytes <= MAX_TOOL_OUTPUT_BYTES) {
    return value;
  }

  const truncated: TruncatedOutput = {
    truncated: true,
    bytes,
    sha256: createHash('sha256').update(json, 'utf8').digest('hex'),
    prefix: json.slice(0, TRUNCATED_PREFIX_BYTES),
  };

  return truncated;
}

/** The payload with its output fields bounded; every other field is passed on untouched. */
function boundPayload(payload: HookPayload): HookPayload {
  const out: Record<string, unknown> = { ...payload };
  for (const field of ['tool_response', 'error']) {
    if (field in out) {
      out[field] = boundOutput(out[field]);
    }
  }

  return out as HookPayload;
}

function endpoint(cfg: HookConfig): string {
  return `${cfg.server_url.replace(/\/+$/, '')}/runs/${encodeURIComponent(cfg.run_id)}/hook`;
}

async function post(io: HookIo, cfg: HookConfig, body: unknown): Promise<HookResponse> {
  const res = await io.fetch(endpoint(cfg), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${cfg.token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(cfg.timeout_ms),
  });

  if (!res.ok) {
    throw new Error(`server_status_${res.status}`);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error('response_malformed');
  }

  const parsed = HookResponse.safeParse(json);
  if (!parsed.success) {
    throw new Error('response_malformed');
  }

  return parsed.data;
}

function codeOf(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return 'timeout';
    }

    if (/^[a-z_0-9]+$/.test(error.message)) {
      return error.message;
    }
  }

  return 'server_unreachable';
}

/** Decides one event. Never throws; every path returns an exit code. */
export async function runHook(io: HookIo): Promise<HookResult> {
  const rawEvent = peekEvent(io.stdin);
  try {
    let json: unknown;
    try {
      json = JSON.parse(io.stdin);
    } catch {
      return failClosed(rawEvent, 'stdin_not_json');
    }

    const payload = HookPayload.safeParse(json);
    if (!payload.success) {
      return failClosed(rawEvent, 'payload_invalid');
    }

    const event = payload.data.hook_event_name;
    const cfg = await loadHookConfig(io);
    try {
      const res = await post(io, cfg, {
        event,
        payload: boundPayload(payload.data),
        seq: io.now(),
      });

      return fromResponse(event, res);
    } catch (error) {
      return failClosed(event, codeOf(error));
    }
  } catch (error) {
    return failClosed(rawEvent, codeOf(error));
  }
}

/** Reads a stream to the end, or rejects `stdin_timeout` so a silent harness cannot hang us. */
export async function readStream(
  stream: AsyncIterable<unknown>,
  timeoutMs = STDIN_TIMEOUT_MS,
): Promise<string> {
  const chunks: Buffer[] = [];
  const read = (async () => {
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk as Uint8Array));
    }
  })();

  const timer = new Promise<void>((_, reject) => {
    setTimeout(() => reject(new Error('stdin_timeout')), timeoutMs).unref();
  });

  await Promise.race([read, timer]);

  return Buffer.concat(chunks).toString('utf8');
}

const write = (stream: HookProcess['stdout'], text: string): Promise<void> =>
  text
    ? new Promise((resolve) => {
        stream.write(text, () => resolve());
      })
    : Promise.resolve();

/** Process entry: reads stdin, runs the hook, flushes output and returns the exit code. */
export async function main(proc: HookProcess = process): Promise<number> {
  let result: HookResult;
  try {
    const stdin = await readStream(proc.stdin);
    result = await runHook({
      stdin,
      env: proc.env,
      argv: proc.argv.slice(2),
      fetch: (input, init) => fetch(input, init),
      readFile: (p) => readFile(p, 'utf8'),
      now: () => Date.now(),
    });
  } catch (error) {
    result = failClosed(undefined, codeOf(error));
  }

  await write(proc.stdout, result.stdout);
  await write(proc.stderr, result.stderr);

  return result.exitCode;
}
