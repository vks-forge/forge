/**
 * Tests for the rules that decide whether the Director may answer a Worker alone.
 *
 * Why: this is the one place where a model's answer becomes a decision about the owner's
 *   project. The answer is used only when every safeguard holds: the model decided to answer,
 *   it is sure enough for the owner's threshold, it cited something, the ticket is not Tier C
 *   (by prediction or by a planned file) and the owner did not ask to approve everything. Any one
 *   missing sends the question to the owner with the reason in words, so a change to these rules
 *   is a change to how much the Director may do alone and must fail a test first.
 *
 * Pins: the answer is allowed only when all conditions hold, each failed condition gives its own
 *   note, the threshold is inclusive, Tier C is read from the prediction and from the planned
 *   files against the Tier C globs, and the retry rule allows exactly as many Director retries as
 *   the owner set.
 * Depends on: src/domain/escalation-decision, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  canAutoAnswer,
  directorMayRetry,
  touchesTierC,
} from '#/domain/escalation-decision.js';

const out = {
  decision: 'answer' as const,
  answer: 'Use blue.',
  confidence: 0.9,
  grounds: [{ kind: 'decision' as const, ref: 'd-0012' }],
};

const ok = { threshold: 0.8, tierC: false, approvalMode: 'director_or_user' as const };

describe('canAutoAnswer', () => {
  it('allows an answer with grounds at or above the threshold', () => {
    expect(canAutoAnswer(out, ok)).toEqual({ answer: true, text: 'Use blue.' });
    expect(canAutoAnswer({ ...out, confidence: 0.8 }, ok)).toMatchObject({
      answer: true,
    });
  });

  it('refuses below the threshold and says how sure it was', () => {
    const r = canAutoAnswer({ ...out, confidence: 0.79 }, ok);

    expect(r).toMatchObject({ answer: false });
    expect(r.answer === false && r.note).toContain('0.79');
    expect(r.answer === false && r.note).toContain('0.8');
  });

  it('refuses with no grounds', () => {
    const r = canAutoAnswer({ ...out, grounds: [] }, ok);

    expect(r.answer === false && r.note).toMatch(/cite|source/);
  });

  it('never answers on Tier C, whatever the confidence', () => {
    const r = canAutoAnswer({ ...out, confidence: 1 }, { ...ok, tierC: true });

    expect(r.answer === false && r.note).toMatch(/Tier C/);
  });

  it('never answers when the owner approves everything', () => {
    const r = canAutoAnswer(out, { ...ok, approvalMode: 'always_ask' });

    expect(r.answer === false && r.note).toMatch(/approve everything/);
  });

  it('refuses when the model chose to escalate, and keeps its reason', () => {
    const r = canAutoAnswer(
      { ...out, decision: 'escalate', escalate_reason: 'owner_preference' },
      ok,
    );

    expect(r.answer === false && r.note).toMatch(/preference|choice/);
  });
});

describe('touchesTierC', () => {
  const globs = ['.forge/**', 'src/policy/**'];

  it('is true for a Tier C prediction and for a planned file on a Tier C path', () => {
    expect(touchesTierC('C', [], globs)).toBe(true);
    expect(touchesTierC('A', ['src/policy/floor.ts'], globs)).toBe(true);
    expect(touchesTierC('B', ['.forge/config/x.yaml'], globs)).toBe(true);
  });

  it('is false otherwise', () => {
    expect(touchesTierC('A', ['src/ui.ts'], globs)).toBe(false);
    expect(touchesTierC('B', [], globs)).toBe(false);
  });
});

describe('directorMayRetry', () => {
  it('allows retries while fewer than the owner allowed were made', () => {
    expect(directorMayRetry(0, 1)).toBe(true);
    expect(directorMayRetry(1, 1)).toBe(false);
    expect(directorMayRetry(0, 0)).toBe(false);
    expect(directorMayRetry(2, 3)).toBe(true);
  });
});
