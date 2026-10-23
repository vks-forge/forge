/**
 * Pins: the Claude DirectorLLM reads the child's output as UTF-8 text even when a chunk ends
 * in the middle of a multi-byte character.
 *
 * Why: a pipe delivers bytes in arbitrary chunks. Decoding each chunk on its own turns a "…" or
 *   "→" split across two chunks into U+FFFD, so the Director's reply or plan text reaches the
 *   owner garbled. One streaming decoder per pipe keeps the character whole.
 *
 * Depends on: src/adapters/claude/director-llm, helpers/fake-clock. No real process: a fake child on in-memory pipes.
 */

import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createClaudeDirectorLLM } from '#/adapters/claude/director-llm.js';
import type { ChildLike, SpawnFn } from '#/types/claude/driver-deps.types.js';
import { createFakeClock } from '#tests/helpers/fake-clock.js';

const Answer = z.object({ answer: z.string() });

describe('Claude DirectorLLM output decoding', () => {
  it('keeps a multi-byte character that is split across two chunks', async () => {
    const doc = JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: '',
      session_id: 's',
      total_cost_usd: 0.001,
      structured_output: { answer: 'thinking… then → done' },
    });

    const bytes = Buffer.from(doc, 'utf8');
    const cut = bytes.indexOf(Buffer.from('…', 'utf8')) + 1;
    const spawn: SpawnFn = () => {
      const child = new EventEmitter() as unknown as ChildLike & EventEmitter;
      const stdout = new PassThrough();
      Object.assign(child, {
        stdin: new PassThrough(),
        stdout,
        stderr: new PassThrough(),
        kill: () => true,
      });

      setImmediate(() => {
        stdout.write(bytes.subarray(0, cut));
        setImmediate(() => {
          stdout.end(bytes.subarray(cut));
          child.emit('exit', 0, null);
        });
      });

      return child;
    };

    const llm = createClaudeDirectorLLM({
      spawn,
      clock: createFakeClock(),
      baseEnv: {},
      claudeBinary: '/forge/test/bin/claude',
      fileExists: () => true,
      platform: 'linux',
    });

    const r = await llm.step('triage', {}, Answer, { model: 'haiku', budgetUsd: 0.05 });

    expect(r).toMatchObject({ ok: true, value: { answer: 'thinking… then → done' } });
  });
});
