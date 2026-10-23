/**
 * Pins: the protected-files wording says the Director signs clean work and the owner signs the
 * rest, never "always", and a sign-off title carries the Director's reason for not signing.
 *
 * Why: the Director now signs protected-files work when every check passed and no secret file is
 *   touched (d-0181). A screen that still said "always needs you" would be false and the owner
 *   would stop trusting the settings; a title with no reason leaves them guessing why this one
 *   came to them.
 * Depends on: domain/protected-files-copy.
 */

import { describe, expect, it } from 'vitest';
import {
  DIRECTOR_SIGNED_PROTECTED,
  PROTECTED_CEILING_NOTE,
  PROTECTED_PATHS_HINT,
  PROTECTED_RULE,
  signOffTitle,
} from '#/domain/protected-files-copy.js';

describe('protected files wording', () => {
  it('states the clean-floor rule in every place it is used', () => {
    for (const text of [PROTECTED_RULE, PROTECTED_PATHS_HINT, PROTECTED_CEILING_NOTE]) {
      expect(text).toMatch(/every check passed/);
      expect(text).toMatch(/no secret file is touched/);
      expect(text).not.toMatch(/always/i);
      expect(text).not.toMatch(/\btier\b/i);
    }
  });

  it('covers the case the Director signed', () => {
    expect(DIRECTOR_SIGNED_PROTECTED).toMatch(/The Director signed this off/);
  });
});

describe('signOffTitle', () => {
  it('keeps the plain protected-files title when the Director left no note', () => {
    expect(signOffTitle('tier_c')).toBe(
      'Needs your sign-off: it touches protected files',
    );
  });

  it('adds the Director reason to a protected-files title', () => {
    expect(signOffTitle('tier_c', 'A check found a high finding')).toBe(
      'Needs your sign-off: it touches protected files. The Director did not sign: A check found a high finding',
    );
  });

  it('cuts a long note short so the title stays one line', () => {
    const title = signOffTitle('tier_c', 'x'.repeat(300));

    expect(title.length).toBeLessThan(180);
    expect(title.endsWith('…')).toBe(true);
  });

  it('leaves other causes alone', () => {
    expect(signOffTitle('tier_b', 'note')).toBe('Ready for your sign-off');
  });
});
