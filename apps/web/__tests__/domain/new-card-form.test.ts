/**
 * Pins: the New card form's rules (title 4 to 120 characters, description at least 20, links
 * that are http or https, no card on both dependency lists), the request it becomes, which
 * cards the dependency pickers offer, and how a refused create is worded.
 *
 * Why: these rules decide when Create lights up and what the user is told when the server
 *   says no. A rule that drifts from the server's sends the user to a 400 they could have been
 *   warned about; a cycle message that does not name the cards leaves them guessing which
 *   dependency to remove.
 * Depends on: src/domain/new-card-form, src/api/api-error. No IO.
 */

import { describe, expect, it } from 'vitest';
import { ApiError } from '#/api/api-error.js';
import {
  EMPTY_NEW_CARD,
  cycleOf,
  openCardItems,
  refusalOf,
  toNewCardInput,
  validateNewCard,
} from '#/domain/new-card-form.js';
import type { CardSummary } from '#/schemas/cards.js';
import { NewCardInput } from '#/schemas/new-card.js';
import { SAMPLE_CARDS } from '#tests/helpers/forge-data/card-data.js';

const valid = {
  ...EMPTY_NEW_CARD,
  title: 'Retry failed webhooks',
  description: 'Failed webhook sends should retry with backoff.',
};

const refused = (code: string, body: unknown, status = 409) =>
  new ApiError('http', 'refused', { status, code, body });

describe('validateNewCard', () => {
  it('accepts a card with a real title and description', () => {
    expect(validateNewCard(valid)).toEqual({});
  });

  it.each([
    ['', true],
    ['abc', true],
    ['abcd', false],
    ['x'.repeat(120), false],
    ['x'.repeat(121), true],
    ['   abc   ', true],
  ])('title %j is a problem: %s', (title, problem) => {
    expect('title' in validateNewCard({ ...valid, title })).toBe(problem);
  });

  it.each([
    ['', true],
    ['x'.repeat(19), true],
    ['x'.repeat(20), false],
    [`${'x'.repeat(19)}      `, true],
  ])('description %j is a problem: %s', (description, problem) => {
    expect('description' in validateNewCard({ ...valid, description })).toBe(problem);
  });

  it('refuses a card on both lists and names it', () => {
    const problems = validateNewCard({
      ...valid,
      dependsOn: ['FG-C1', 'FG-C2'],
      blocks: ['FG-C2'],
    });

    expect(problems.blocks).toContain('FG-C2');
    expect(problems.blocks).not.toContain('FG-C1');
  });

  it.each([
    ['https://example.com/a', false],
    ['http://localhost:3000', false],
    ['ftp://example.com', true],
    ['javascript:alert(1)', true],
    ['example.com', true],
    ['', true],
  ])('link %j is a problem: %s', (link, problem) => {
    expect('links' in validateNewCard({ ...valid, links: [link] })).toBe(problem);
  });
});

describe('toNewCardInput', () => {
  it('trims text and parses as the strict request the server expects', () => {
    const input = toNewCardInput(
      { ...valid, title: '  Retry failed webhooks ', dependsOn: ['FG-C1'] },
      crypto.randomUUID(),
    );

    expect(input.title).toBe('Retry failed webhooks');
    expect(NewCardInput.safeParse(input).success).toBe(true);
    expect(Object.keys(input).sort()).toEqual(
      [
        'blocks',
        'dedupe_key',
        'depends_on',
        'description',
        'links',
        'priority',
        'title',
        'type',
      ].sort(),
    );
  });

  it('keeps the dedupe key it was given', () => {
    const key = crypto.randomUUID();

    expect(toNewCardInput(valid, key).dedupe_key).toBe(key);
  });
});

describe('openCardItems', () => {
  it('offers cards that are neither done nor closed, with id and title', () => {
    const items = openCardItems(SAMPLE_CARDS.map((card) => card.summary));

    expect(items.map((item) => item.value)).toEqual(['FG-C1', 'FG-C2', 'FG-C3', 'FG-C4']);
    expect(items[1]?.label).toBe('FG-C2 · Plan a retry strategy for webhooks');
  });

  it('drops a card that carries a closing reason even if its column lags', () => {
    const card = {
      ...SAMPLE_CARDS[0]!.summary,
      closed_reason: 'done here',
    } as CardSummary;

    expect(openCardItems([card])).toEqual([]);
  });
});

describe('cycleOf and refusalOf', () => {
  it.each([
    ['inside the error', { error: { code: 'dependency_cycle', cycle: ['A', 'B', 'A'] } }],
    [
      'in error.details',
      { error: { code: 'dependency_cycle', details: { cycle: ['A', 'B', 'A'] } } },
    ],
    ['at the top level', { error: { code: 'dependency_cycle' }, cycle: ['A', 'B', 'A'] }],
  ])('finds the cycle %s', (_where, body) => {
    expect(cycleOf(refused('dependency_cycle', body))).toEqual(['A', 'B', 'A']);
  });

  it('finds no cycle in a body that has none', () => {
    expect(cycleOf(refused('dependency_cycle', null))).toBeNull();
    expect(cycleOf(refused('dependency_cycle', { cycle: [1, 2] }))).toBeNull();
  });

  it('names the cards in a loop and points at the dependency field', () => {
    const refusal = refusalOf(
      refused('dependency_cycle', { error: { cycle: ['DCP-C3', 'DCP-C1', 'DCP-C3'] } }),
    );

    expect(refusal.field).toBe('dependsOn');
    expect(refusal.message).toContain('DCP-C3 → DCP-C1 → DCP-C3');
  });

  it('still explains a loop when the server sent no cards', () => {
    expect(refusalOf(refused('dependency_cycle', null)).message).toMatch(/loop/);
  });

  it.each([
    ['card_not_found', 404, /no longer exists/],
    ['cross_project_dependency', 400, /this project/],
    ['project_not_found', 404, /no longer exists, so the card was not created/],
    ['invalid_request', 400, /did not accept the card/],
  ])('words %s', (code, status, text) => {
    expect(refusalOf(refused(code, null, status)).message).toMatch(text);
  });

  it('falls back to the plain explanation of a network failure', () => {
    const refusal = refusalOf(new ApiError('network', 'down'));

    expect(refusal.message).toContain('Cannot reach Forge');
    expect(refusal.field).toBeUndefined();
  });
});
