/**
 * Pins: the structured JSON logger and the random id source.
 *
 * Why: the server's output is read by a person tailing a terminal and later by a log
 * shipper, and logging must never throw or print a credential. Run tokens are bearer
 * credentials, so ids and tokens must come from the OS random source and be URL-safe.
 *
 * Depends on: src/shared/json-logger, src/shared/ids. No IO beyond the OS random source.
 */

import { describe, expect, it } from 'vitest';
import { createIdSource, createOwnerId } from '#/shared/ids.js';
import { createJsonLogger } from '#/shared/json-logger.js';

describe('createJsonLogger', () => {
  const at = (): Date => new Date('2026-10-13T00:00:00.000Z');

  it('writes one JSON object per line and drops levels below the minimum', () => {
    const lines: string[] = [];
    const log = createJsonLogger((line) => lines.push(line), 'info', at);

    log('debug', 'quiet');
    log('info', 'hello', { run: 'run-1' });

    expect(lines).toEqual([
      '{"ts":"2026-10-13T00:00:00.000Z","level":"info","message":"hello","fields":{"run":"run-1"}}\n',
    ]);
  });

  it('redacts fields whose names look like credentials', () => {
    const lines: string[] = [];
    createJsonLogger((l) => lines.push(l), 'debug', at)('warn', 'x', {
      token: 'abc',
      FORGE_RUN_TOKEN: 'def',
      authorization: 'Bearer ghi',
      ok: 1,
    });

    expect(lines.join('')).not.toMatch(/abc|def|ghi/);
    expect(lines.join('')).toContain('"ok":1');
  });

  it('never throws when the sink does', () => {
    const log = createJsonLogger(() => {
      throw new Error('stderr closed');
    });

    expect(() => log('error', 'x')).not.toThrow();
  });
});

describe('createIdSource', () => {
  it('makes random, URL-safe ids and 256-bit tokens', () => {
    const ids = createIdSource();

    expect(ids.runId()).toMatch(/^run-[0-9a-f]{20}$/);
    expect(ids.wakeId()).toMatch(/^wake-[0-9a-f]{20}$/);
    expect(ids.interactionId()).toMatch(/^int-[0-9a-f]{20}$/);
    expect(ids.token()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(ids.token()).not.toBe(ids.token());
    expect(createOwnerId()).not.toBe(createOwnerId());
  });
});
