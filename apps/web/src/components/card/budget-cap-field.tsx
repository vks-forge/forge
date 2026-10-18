/**
 * BudgetCapField: a card's budget cap, shown on its Details tab and editable in place;
 * BudgetCapForm is the same box on its own, for the Inbox drawer.
 *
 * Why: research and long plans can run a card up in cost, and the owner wants a number to be
 *   warned at. The cap warns, it never stops work: crossing 80 percent and 100 percent of it
 *   puts one item in the Inbox, and the card goes on. The field says that outright, because
 *   a "cap" is otherwise read as a wall. The box is read before it is sent (a typo is a
 *   sentence under the box, not a refusal), an empty box clears the cap and "No cap" says
 *   there is none, never "$0". A closed card cannot change its cap, and the field says why
 *   instead of hiding the control. Escape or Cancel leaves the cap as it was.
 *
 * Exports: BudgetCapForm, BudgetCapField.
 * Depends on: react, api/use-card, api/describe-error, components/settings/form-field,
 *   components/ui/button, domain/research-copy, domain/stats-format, state/notify/notify-context.
 */

import { useEffect, useRef, useState } from 'react';
import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import { usePatchCard } from '#/api/use-card.js';
import { FormField, TextInput } from '#/components/settings/form-field.js';
import { Button } from '#/components/ui/button.js';
import { parseBudgetCap } from '#/domain/research-copy.js';
import { formatUsd } from '#/domain/stats-format.js';
import { useNotify } from '#/state/notify/notify-context.js';

const HINT = 'Warning only, never stops the card. Leave empty for no cap.';

/** The cap box with Save, Clear and Cancel; shared by the Details tab and the Inbox drawer. */
export function BudgetCapForm(props: {
  cardId: string;
  cap: number | undefined;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const patch = usePatchCard(props.cardId);
  const notify = useNotify();
  const [text, setText] = useState(props.cap === undefined ? '' : String(props.cap));
  const box = useRef<HTMLInputElement>(null);

  // The box opens under the button that was pressed: focus follows it, so typing and Escape work at once.
  useEffect(() => box.current?.focus(), []);

  const parsed = parseBudgetCap(text);
  const problem = parsed.ok ? undefined : parsed.message;
  const failed =
    patch.error instanceof ApiError && patch.error.code === 'card_closed'
      ? 'This card is closed, so its cap cannot change.'
      : patch.isError
        ? describeError(patch.error).detail
        : undefined;

  const save = (value: number | null): void =>
    patch.mutate(
      { budget_cap_usd: value },
      {
        onSuccess: () => {
          notify.success(value === null ? 'Budget cap cleared' : 'Budget cap saved');
          props.onSaved();
        },
      },
    );

  return (
    <form
      aria-label="Budget cap"
      className="grid max-w-sm gap-2"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          props.onCancel();
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();

        if (parsed.ok) {
          save(parsed.value);
        }
      }}
    >
      <FormField
        id="budget-cap"
        label="Budget cap (USD)"
        hint={HINT}
        error={problem ?? failed}
      >
        <TextInput
          ref={box}
          id="budget-cap"
          hasHint
          inputMode="decimal"
          autoComplete="off"
          value={text}
          error={problem ?? failed}
          onChange={(event) => setText(event.target.value)}
        />
      </FormField>
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant="primary"
          status={patch.isPending ? 'loading' : 'idle'}
          disabled={!parsed.ok}
        >
          Save cap
        </Button>
        {props.cap === undefined ? null : (
          <Button disabled={patch.isPending} onClick={() => save(null)}>
            Clear cap
          </Button>
        )}
        <Button disabled={patch.isPending} onClick={props.onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function BudgetCapField(props: {
  cardId: string;
  cap: number | undefined;
  closed: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <BudgetCapForm
        cardId={props.cardId}
        cap={props.cap}
        onSaved={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>{props.cap === undefined ? 'No cap' : formatUsd(props.cap)}</span>
      <Button
        disabled={props.closed}
        aria-label="Change the budget cap"
        aria-describedby="budget-cap-note"
        onClick={() => setEditing(true)}
      >
        {props.cap === undefined ? 'Set a cap' : 'Change'}
      </Button>
      <span id="budget-cap-note" className="text-xs text-muted">
        {props.closed ? 'A closed card keeps its cap.' : HINT}
      </span>
    </div>
  );
}
