/**
 * Pins the shape of `server.json`.
 *
 * Why: the CLI trusts this file to find the running server and send it the install token;
 *   a malformed or extended record must be refused, not half-read.
 *
 * Pins: a complete record parses; missing pid, port 0, bad date and unknown fields are refused.
 * Depends on: src/schemas/server-record. No IO.
 */

import { describe, expect, it } from 'vitest';
import { ServerRecord } from '#/schemas/server-record.js';

const valid = {
  pid: 4242,
  port: 4310,
  startedAt: '2026-10-15T10:00:00.000Z',
  version: '0.0.0',
};

describe('ServerRecord', () => {
  it('accepts a complete record', () => {
    expect(ServerRecord.parse(valid)).toEqual(valid);
  });

  it.each([
    ['a missing pid', { ...valid, pid: undefined }],
    ['port 0', { ...valid, port: 0 }],
    ['a non-date startedAt', { ...valid, startedAt: 'yesterday' }],
    ['an unknown field', { ...valid, token: 'x' }],
  ])('rejects %s', (_name, value) => {
    expect(ServerRecord.safeParse(value).success).toBe(false);
  });
});
