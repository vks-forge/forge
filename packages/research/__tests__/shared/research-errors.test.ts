/**
 * Pins the mapping from guard and network failures to the research error kinds.
 *
 * Why: the settings page's Test button and the research step's note say different things for "start
 *   SearXNG" (unreachable), "that host is not allowed" (denied) and "the page is not text" (bad_content).
 *   The kind, never the message, drives that wording, so each failure must land on the right kind.
 *
 * Pins: toResearchError(), researchError().
 * Depends on: src/shared/research-errors, @forge/core, vitest.
 */

import { InvalidInputError, PolicyDeniedError } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { researchError, toResearchError } from '#/shared/research-errors.js';

describe('toResearchError', () => {
  it.each([
    [new PolicyDeniedError('blocked: port 22 is not allowed'), 'denied'],
    [new InvalidInputError('fetch timed out'), 'timeout'],
    [new InvalidInputError('fetch failed: HTTP 404'), 'http_error'],
    [new InvalidInputError('unsupported content type: image/png'), 'bad_content'],
    [new InvalidInputError('SearXNG response too large'), 'too_large'],
    [new InvalidInputError('web search is not configured (no SearXNG URL)'), 'not_configured'],
    [new InvalidInputError('could not resolve nowhere.example'), 'unreachable'],
    [new InvalidInputError('invalid URL'), 'denied'],
    [Object.assign(new Error('x'), { name: 'TimeoutError' }), 'timeout'],
    [Object.assign(new Error('x'), { name: 'AbortError' }), 'timeout'],
    [new TypeError('fetch failed'), 'unreachable'],
    ['a string', 'unreachable'],
  ])('maps %s to %s', (error, kind) => {
    expect(toResearchError(error).kind).toBe(kind);
  });

  it('builds a typed error', () => {
    expect(researchError('denied', 'no')).toEqual({ kind: 'denied', message: 'no' });
  });
});
