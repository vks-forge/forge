/**
 * Pins: scrubSecrets blanks known credential shapes and caller-supplied secret values.
 *
 * Why: the Worker brief is stored as a run event the whole UI can read; a token that rode
 *   into a ticket body or memory slice must not be shown or exported. The same pass backs
 *   the debug trace, so one rule set covers both stores.
 * Depends on: src/domain/scrub-secrets. Pure.
 */

import { describe, expect, it } from 'vitest';
import { REDACTED, scrubSecrets } from '#/domain/scrub-secrets.js';

describe('scrubSecrets', () => {
  it('blanks key shapes and leaves ordinary text alone', () => {
    const text = 'use ghp_abcdefgh12345678 and Bearer abcdefgh12345678 then run tests';

    expect(scrubSecrets(text, [])).toBe(`use ${REDACTED} and ${REDACTED} then run tests`);
  });

  it('blanks exact secret values, longest first', () => {
    expect(scrubSecrets('pw=hunter22 and hunter22x', ['hunter22', 'hunter22x'])).toBe(
      `pw=${REDACTED} and ${REDACTED}`,
    );
  });
});
