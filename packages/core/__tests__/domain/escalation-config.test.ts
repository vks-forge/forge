/**
 * Tests for the `escalation` part of the Director settings and its two playbooks.
 *
 * Why: how far the Director may go alone before it asks the owner is the owner's dial, not code
 *   (code.md rule 9): whether it looks first, how sure it must be to answer a Worker itself, how
 *   many times it may retry a failed ticket before handing over. A value outside its range (a
 *   confidence of 3, a negative retry count) must fail at load, and a project must be able to
 *   override one dial without restating the rest. The two playbooks carry the method of the two
 *   escalation steps; without real text the steps would run on instructions alone.
 *
 * Pins: built-in defaults (director first, 0.8, one retry), range checks, a project override of
 *   one field keeping the others, and the answer-worker and recover-failure playbooks being
 *   real method text of 30 to 60 lines that name the safety rules.
 * Depends on: src/domain/builtin-director, src/domain/merge-config, src/schemas/director-config, vitest.
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_CONFIG } from '#/domain/builtin-config.js';
import { BUILTIN_DIRECTOR_CONFIG } from '#/domain/builtin-director.js';
import { mergeConfig } from '#/domain/merge-config.js';
import { DirectorConfig } from '#/schemas/director-config.js';

describe('director escalation settings', () => {
  it('ships director first, 0.8 confidence and one Director retry', () => {
    expect(BUILTIN_DIRECTOR_CONFIG.escalation).toEqual({
      director_first: true,
      answer_confidence: 0.8,
      max_director_retries: 1,
    });
  });

  it('refuses out-of-range values', () => {
    const bad = (escalation: Record<string, unknown>) =>
      DirectorConfig.safeParse({
        ...BUILTIN_DIRECTOR_CONFIG,
        escalation: { ...BUILTIN_DIRECTOR_CONFIG.escalation, ...escalation },
      }).success;

    expect(bad({ answer_confidence: 3 })).toBe(false);
    expect(bad({ answer_confidence: -0.1 })).toBe(false);
    expect(bad({ max_director_retries: -1 })).toBe(false);
    expect(bad({ max_director_retries: 1.5 })).toBe(false);
    expect(bad({ director_first: 'yes' })).toBe(false);
    expect(bad({ answer_confidence: 0.95, max_director_retries: 0 })).toBe(true);
  });

  it('lets a project override one field and keeps the others', () => {
    const effective = mergeConfig(
      BUILTIN_CONFIG,
      {},
      { director: { escalation: { answer_confidence: 0.95 } } },
    );

    expect(effective.forge.director.escalation).toEqual({
      director_first: true,
      answer_confidence: 0.95,
      max_director_retries: 1,
    });
  });
});

describe('escalation playbooks', () => {
  it.each(['answer-worker', 'recover-failure'])(
    '%s is real method text of 30 to 60 lines',
    (id) => {
      const pb = BUILTIN_DIRECTOR_CONFIG.playbooks[id];
      const lines = pb?.body.split('\n').length ?? 0;

      expect(lines).toBeGreaterThanOrEqual(30);
      expect(lines).toBeLessThanOrEqual(60);
      expect(pb?.body).not.toMatch(/placeholder/i);
    },
  );

  it('answer-worker names the grounds, the Tier C rule and the DATA rule', () => {
    const body = BUILTIN_DIRECTOR_CONFIG.playbooks['answer-worker']?.body ?? '';

    expect(body).toContain('grounds');
    expect(body).toContain('Tier C');
    expect(body).toMatch(/DATA/);
    expect(body).toContain('escalate');
  });

  it('recover-failure never retries what a human must fix', () => {
    const body = BUILTIN_DIRECTOR_CONFIG.playbooks['recover-failure']?.body ?? '';

    expect(body).toContain('acceptance');
    expect(body).toMatch(/auth|login/);
    expect(body).toContain('escalate');
  });
});
