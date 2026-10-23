/**
 * Pins: a server refusal for a too-long field becomes the same "up to N characters, shorten it or
 * send it in two parts" sentence the message box shows, and other refusals keep their wording.
 *
 * Why: the server's validation `issues` used to be dropped, so a message that got past the box
 *   came back as "request failed validation" with no way forward.
 * Depends on: src/api/describe-error, src/api/api-error. Pure.
 */

import { describe, expect, it } from 'vitest';
import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';

const refusal = (issues: unknown) =>
  new ApiError('http', 'request failed validation', {
    status: 400,
    code: 'invalid_request',
    body: {
      error: { code: 'invalid_request', message: 'request failed validation', issues },
    },
  });

describe('describeError: message length', () => {
  it('turns a too-big issue into the sentence with the limit', () => {
    const out = describeError(
      refusal([
        { path: 'text', message: 'Too big: expected string to have <=8000 characters' },
      ]),
    );

    expect(out.title).toBe('That message is too long');
    expect(out.detail).toBe(
      'Messages can be up to 8,000 characters. Shorten it or send it in two parts.',
    );
  });

  it('leaves any other refusal as the server worded it', () => {
    expect(
      describeError(refusal([{ path: 'text', message: 'Invalid input' }])).detail,
    ).toBe('request failed validation');
  });
});
