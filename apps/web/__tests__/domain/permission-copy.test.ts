/**
 * Pins: the exact command is shown with every invisible or direction-flipping character made
 * visible, the rule that asked and the rule "Always" would keep are said in plain words (no raw
 * reason code, no glob syntax, a lane always explained), and an unknown case still reads as a
 * sentence rather than an enum value.
 *
 * Why: the owner consents to what they read. A command that hides a character, or a button that
 * promises a pattern the owner cannot picture, would turn Allow into a guess. Pure.
 * Depends on: src/domain/permission-copy.
 */

import { describe, expect, it } from 'vitest';
import {
  alwaysLine,
  approvedRuleWords,
  laneWords,
  revealInvisible,
  ruleLine,
  wantsLine,
} from '#/domain/permission-copy.js';

const char = (code: number): string => String.fromCharCode(code);

describe('revealInvisible', () => {
  it('returns plain text as one visible run', () => {
    expect(revealInvisible('make install-deps')).toEqual([
      { text: 'make install-deps', hidden: false },
    ]);
  });

  it('turns a direction override, a zero-width space and a lookalike space into markers', () => {
    const parts = revealInvisible(`a${char(0x202e)}b${char(0x200b)}c${char(0xa0)}d`);

    expect(parts.map((part) => part.text)).toEqual([
      'a',
      '‹U+202E›',
      'b',
      '‹U+200B›',
      'c',
      '‹U+00A0›',
      'd',
    ]);

    expect(parts.filter((part) => part.hidden)).toHaveLength(3);
  });

  it('keeps newlines and tabs as they are, so a multi-line command stays readable', () => {
    expect(revealInvisible('a\n\tb')).toEqual([{ text: 'a\n\tb', hidden: false }]);
  });

  it('marks other control characters', () => {
    expect(revealInvisible(`x${char(0x1b)}y`).map((part) => part.text)).toEqual([
      'x',
      '‹U+001B›',
      'y',
    ]);
  });
});

describe('plain words', () => {
  it('names every lane with a short explanation', () => {
    expect(laneWords('full')).toMatch(/Full lane \(the most careful/);
    expect(laneWords('standard')).toMatch(/Standard lane \(the normal/);
    expect(laneWords('express')).toMatch(/Express lane \(the fast/);
    expect(laneWords('custom')).toBe('the custom lane');
  });

  it('says what the Worker wants by the kind of action', () => {
    expect(wantsLine('shell')).toBe('The Worker wants to run this command');
    expect(wantsLine('edit')).toBe('The Worker wants to change this file');
    expect(wantsLine('web_fetch')).toBe('The Worker wants to open this page');
    expect(wantsLine('mcp_thing')).toBe('The Worker wants to use this tool');
  });

  it('turns a reason code and lane into a sentence with no code in it', () => {
    expect(ruleLine('rule_ask', 'full')).toBe(
      'Steps like this need your approval in the Full lane (the most careful way Forge runs a ticket).',
    );

    expect(ruleLine('no_matching_rule', 'standard')).toMatch(
      /Nothing says this step is safe/,
    );

    expect(ruleLine('inspector_raised', 'full')).toMatch(/safety check flagged/);
    expect(ruleLine('budget_soft_limit', 'full')).toMatch(/usage limit/);
    expect(ruleLine('something_new', 'full')).toMatch(
      /needs your approval in the Full lane/,
    );
  });

  it('spells out what an always rule lets through, without glob syntax', () => {
    expect(approvedRuleWords({ action: 'shell', resource: 'make install-deps' })).toBe(
      'Always allow the command `make install-deps`',
    );

    expect(approvedRuleWords({ action: 'edit', resource: 'db/migrations/**' })).toBe(
      'Always allow edits under `db/migrations/`',
    );

    expect(approvedRuleWords({ action: 'write', resource: 'auth/keys.txt' })).toBe(
      'Always allow edits to `auth/keys.txt`',
    );

    expect(
      approvedRuleWords({ action: 'web_fetch', resource: 'https://example.com/x' }),
    ).toBe('Always allow opening `https://example.com/x`');

    expect(approvedRuleWords({ action: 'mcp__db__query', resource: 'orders' })).toBe(
      'Always allow `mcp__db__query` on `orders`',
    );
  });

  it('says what Always keeps, or why it is not offered', () => {
    expect(
      alwaysLine({ offered: true, rule: { action: 'shell', resource: 'make a' } }),
    ).toBe('Always allow the command `make a`, in this project only.');

    expect(alwaysLine({ offered: false, why: 'Protected path: always asks.' })).toBe(
      '“Always” is not offered here. Protected path: always asks.',
    );

    expect(alwaysLine({ offered: false })).toMatch(/approved each time/);
  });
});
