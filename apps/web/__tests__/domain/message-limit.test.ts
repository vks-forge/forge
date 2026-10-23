/**
 * Pins: the counter appears from 90 percent of the limit, the over-limit sentence names the limit
 * and this message's length, and a server validation issue about length is recognised.
 *
 * Why: a long pasted log used to be refused with a bare validation error; the owner must see the
 *   limit coming and know what to do (shorten, or send in two parts).
 * Depends on: src/domain/message-limit. Pure.
 */

import { describe, expect, it } from 'vitest';
import {
  counterText,
  limitFromIssue,
  overLimit,
  overLimitSentence,
  showsCounter,
} from '#/domain/message-limit.js';

describe('message limit words', () => {
  it('starts counting at 90 percent and not before', () => {
    expect(showsCounter(7199, 8000)).toBe(false);
    expect(showsCounter(7200, 8000)).toBe(true);
    expect(counterText(7412, 8000)).toBe('7,412 / 8,000');
  });

  it('is over only past the limit', () => {
    expect(overLimit(8000, 8000)).toBe(false);
    expect(overLimit(8001, 8000)).toBe(true);
  });

  it('says what to do about a message that is too long', () => {
    expect(overLimitSentence(8000, 20412)).toBe(
      'Messages can be up to 8,000 characters; this one has 20,412. Shorten it or send it in two parts.',
    );

    expect(overLimitSentence(8000)).toBe(
      'Messages can be up to 8,000 characters. Shorten it or send it in two parts.',
    );
  });

  it('reads the limit out of a server length issue and ignores other issues', () => {
    expect(limitFromIssue('Too big: expected string to have <=8000 characters')).toBe(
      8000,
    );

    expect(limitFromIssue('Invalid input')).toBeNull();
  });
});
