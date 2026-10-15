/**
 * The shipped list of verified builds is well formed.
 *
 * Why: a known-good build skips the check and has its tools approved from this list, so a typo
 * in a hash or a missing core tool would either approve a shape nobody saw or leave Workers
 * with no Read tool on a build the release claims to support. The list is also the only place a
 * version is declared verified, so a duplicate would make which entry wins accidental.
 *
 * Pins: KNOWN_GOOD_BUILDS entries (unique versions, core tools, sha256 hashes), findKnownGood().
 * Depends on: src/compat/known-good, src/compat/evaluate (CORE_TOOLS). No IO.
 */

import { describe, expect, it } from 'vitest';
import { CORE_TOOLS } from '#/compat/evaluate.js';
import { KNOWN_GOOD_BUILDS, findKnownGood } from '#/compat/known-good.js';

describe('KNOWN_GOOD_BUILDS', () => {
  it('lists each version once, with a sha256 hash for every core tool', () => {
    const versions = KNOWN_GOOD_BUILDS.map((b) => b.version);

    expect(new Set(versions).size).toBe(versions.length);
    expect(versions).toEqual(expect.arrayContaining(['2.1.293', '2.1.299']));
    for (const build of KNOWN_GOOD_BUILDS) {
      expect(Object.keys(build.tools)).toEqual(expect.arrayContaining([...CORE_TOOLS]));
      for (const hash of Object.values(build.tools)) {
        expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      }
    }
  });

  it('records the Read tool change between 2.1.293 and 2.1.299 as two different shapes', () => {
    expect(findKnownGood('2.1.293')?.tools['read']).not.toBe(
      findKnownGood('2.1.299')?.tools['read'],
    );
  });

  it('does not know a build it never verified', () => {
    expect(findKnownGood('2.1.296')).toBeUndefined();
  });
});
