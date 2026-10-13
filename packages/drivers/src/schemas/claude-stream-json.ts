/**
 * Schemas for `claude -p --output-format stream-json --verbose` lines.
 *
 * Why: the CLI engine learns everything about a run from one line-delimited JSON stream
 *   written by a third-party binary: the session id, each tool call, each tool result, the
 *   cost and, above all, how the run ended. A budget stop is exit code 0 with no `result`
 *   text (probe 1), a refusal is a normal-looking result, and a rate limit can arrive as a
 *   `result` error or a separate event. Parsing each line against a lenient schema at the
 *   boundary keeps unknown fields and unknown line types harmless, while the fields the
 *   driver acts on (`subtype`, `is_error`, `session_id`, `total_cost_usd`) are checked, so
 *   a format change surfaces as an `unknown` outcome rather than a misread success.
 *
 * Exports: CliLine, CliContentBlock, CliResultLine, parseCliLine().
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

const Usage = z
  .object({
    input_tokens: z.number().optional(),
    output_tokens: z.number().optional(),
    cache_read_input_tokens: z.number().optional(),
    cache_creation_input_tokens: z.number().optional(),
  })
  .passthrough();

/** One block of an assistant or user message. */
export const CliContentBlock = z.union([
  z.object({ type: z.literal('text'), text: z.string() }).passthrough(),
  z
    .object({
      type: z.literal('tool_use'),
      id: z.string(),
      name: z.string(),
      input: z.unknown().optional(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal('tool_result'),
      tool_use_id: z.string(),
      content: z.unknown().optional(),
      is_error: z.boolean().optional(),
    })
    .passthrough(),
  z.object({ type: z.string() }).passthrough(),
]);
export type CliContentBlock = z.infer<typeof CliContentBlock>;

const Message = z
  .object({ content: z.union([z.string(), z.array(CliContentBlock)]) })
  .passthrough();

/** The final `result` line. `result` is absent on a budget stop. */
export const CliResultLine = z
  .object({
    type: z.literal('result'),
    subtype: z.string().optional(),
    is_error: z.boolean().optional(),
    result: z.string().optional(),
    /** Present with `--json-schema`: the model's answer, already parsed (Director steps). */
    structured_output: z.unknown().optional(),
    errors: z.array(z.string()).optional(),
    session_id: z.string().optional(),
    total_cost_usd: z.number().optional(),
    terminal_reason: z.string().optional(),
    stop_reason: z.string().nullable().optional(),
    api_error_status: z.number().nullable().optional(),
    usage: Usage.optional(),
    modelUsage: z
      .record(
        z.string(),
        z
          .object({
            inputTokens: z.number().optional(),
            outputTokens: z.number().optional(),
            cacheReadInputTokens: z.number().optional(),
            cacheCreationInputTokens: z.number().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();
export type CliResultLine = z.infer<typeof CliResultLine>;

export const CliLine = z.union([
  z
    .object({
      type: z.literal('system'),
      subtype: z.string().optional(),
      session_id: z.string().optional(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal('assistant'),
      message: Message,
      session_id: z.string().optional(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal('user'),
      message: Message,
      session_id: z.string().optional(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal('rate_limit_event'),
      rate_limit_info: z
        .object({
          status: z.string().optional(),
          resetsAt: z.number().optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough(),
  CliResultLine,
  z.object({ type: z.string() }).passthrough(),
]);
export type CliLine = z.infer<typeof CliLine>;

/** Parses one stdout line; null for blank, non-JSON or schema-foreign lines. */
export function parseCliLine(line: string): CliLine | null {
  const text = line.trim();
  if (!text.startsWith('{')) {
    return null;
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }

  const parsed = CliLine.safeParse(json);

  return parsed.success ? parsed.data : null;
}
