/**
 * Pins: every owner-facing term in the glossary has a label and a plain explanation, none of
 * them leaks an internal word (G1, tier, lane, tick, npm, node, package.json), the apply-timing
 * sentence promises no restart, and the care/risk header detail reads in words.
 *
 * Why: the owner does not code. One leaked internal word on a screen sends them to guess; this
 *   test fails when a term is added without an explanation or one is written in builder's terms.
 * Depends on: domain/plain-words.
 */

import { describe, expect, it } from 'vitest';
import {
  APPLY_TIMING,
  TERM,
  careAndRisk,
  careWords,
  riskWords,
  stateLabel,
} from '#/domain/plain-words.js';

const INTERNAL = /\b(G1|tier|lane|tick|npm|node|package\.json)\b/i;

describe('plain words glossary', () => {
  it('gives every term a label and an explanation', () => {
    for (const [id, term] of Object.entries(TERM)) {
      expect(term.id).toBe(id);
      expect(term.label.trim()).not.toBe('');
      expect(term.explain.trim().length).toBeGreaterThan(20);
    }
  });

  it('never uses an internal word in a label or an explanation', () => {
    for (const term of Object.values(TERM)) {
      expect(term.label).not.toMatch(INTERNAL);
      expect(term.explain).not.toMatch(INTERNAL);
    }

    expect(APPLY_TIMING).not.toMatch(INTERNAL);
  });

  it('explains the independent check as a separate reviewer using the project checks', () => {
    expect(TERM.check.explain).toMatch(/separate AI reviewer/);
    expect(TERM.check.explain).toMatch(/tests/);
  });

  it('says protected files are signed by the Director only when clean', () => {
    expect(TERM.risk.explain).toMatch(/only when every check passed/);
    expect(TERM.risk.explain).toMatch(/otherwise you do/);
  });

  it('says changes apply without a restart', () => {
    expect(APPLY_TIMING).toMatch(/No restart needed/);
  });

  it('names the ticket state in words, never the stored value', () => {
    expect(stateLabel('in_progress')).toBe('In progress');
    expect(stateLabel('in_progress')).not.toMatch(/_/);
  });

  it('writes the header detail as care and risk', () => {
    expect(careWords('standard')).toBe('Standard care');
    expect(riskWords('B')).toBe('moderate risk');
    expect(careAndRisk('standard', 'B')).toBe('Standard care · moderate risk');
    expect(careAndRisk('full', 'C')).toBe('Full care · protected files');
  });
});
