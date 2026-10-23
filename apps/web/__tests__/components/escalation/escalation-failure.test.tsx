/**
 * Pins: a failure card for a turn-limit stop says how many turns the Worker used and links to the
 * setting that raises them; a failure without a limit shows only its summary.
 *
 * Why: the owner reads this card next to Retry, Re-plan and Cancel. Without the number and the link
 *   they must guess which limit to change and where; a link that goes nowhere is as bad as none.
 * Depends on: components/escalation/escalation-failure, react-router. jsdom.
 */

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { EscalationFailure } from '#/components/escalation/escalation-failure.js';
import type { FailurePayload } from '#/types/escalation-ui.types.js';

const base: FailurePayload = {
  kind: 'failure',
  cause: 'max_turns',
  summary: 'max_turns: the run used all 3 turns without finishing',
  attempts: [],
};

const draw = (failure: FailurePayload) =>
  render(
    <MemoryRouter>
      <EscalationFailure failure={failure} />
    </MemoryRouter>,
  );

describe('EscalationFailure turn limit', () => {
  it('names the turns used and links to the Limits setting', () => {
    draw({
      ...base,
      limit: {
        kind: 'turns',
        value: 3,
        source: 'forge',
        fix_href: '/settings/limits#spend',
      },
    });

    expect(screen.getByText(/The Worker used all 3 of its turns/)).toBeVisible();
    expect(screen.getByText('Turns per run').tagName).toBe('STRONG');

    const link = screen.getByRole('link', { name: 'Settings → Limits' });

    expect(link).toHaveAttribute('href', '/settings/limits#spend');
  });

  it('shows no limit help when the failure carries no limit', () => {
    draw({
      ...base,
      cause: 'retry_cap',
      summary: 'crash: failed 2 times (retry limit 1)',
    });

    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('EscalationFailure merge conflict', () => {
  const clash: FailurePayload = {
    ...base,
    cause: 'merge_conflict',
    summary: 'merge conflict: the Worker could not combine src/cli.ts',
    conflict: {
      files: ['src/cli.ts', 'a.txt', 'b.txt', 'c.txt', 'd.txt', 'e.txt', 'f.txt'],
      upstream: [
        { ref: 'abc1234', ticket_id: 'FR-6', title: 'Add the --json flag' },
        { ref: 'def5678', title: 'Tidy the readme' },
      ],
    },
  };

  it('lists the clashing files, hides the overflow behind a count, and names who changed them first', () => {
    draw(clash);

    expect(screen.getByText('src/cli.ts', { selector: 'li' })).toBeVisible();
    expect(screen.getByText('Show 2 more files')).toBeInTheDocument();
    expect(screen.getByText('FR-6: Add the --json flag')).toBeVisible();
    expect(screen.getByText('Tidy the readme (def5678)')).toBeVisible();
    expect(screen.getByText(/Try again gives it one more attempt/)).toBeVisible();
  });

  it('shows only the help when the payload carries no conflict detail', () => {
    draw({ ...base, cause: 'merge_conflict', summary: clash.summary });

    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByText(/Another ticket changed the same files first/)).toBeVisible();
  });
});
