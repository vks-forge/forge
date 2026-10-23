/**
 * TicketEditForm: change a ticket's priority, what it waits for and (before work starts) its description.
 *
 * Why: until now the owner could not raise a priority, fix a line of a brief or order one ticket
 *   before another once a plan was approved, so restored work could not be put ahead of the
 *   tickets that needed it. The form sits on the Details tab behind one button, shows only what
 *   can change (a started ticket keeps its brief and cannot be made to wait, because its Worker
 *   already has them) and says so in words instead of hiding the control. Waits are picked from the
 *   project's other tickets as a list of ids with titles, so nothing has to be remembered or typed.
 *   Only changed fields are sent, a refusal from Forge (a loop, a cancelled ticket) is shown as the
 *   sentence it sends, and Cancel or Escape leaves the ticket as it was.
 *
 * Exports: TicketEditForm.
 * Depends on: react, @forge/core (types), api/use-tickets, api/describe-error,
 *   components/settings/form-field, components/ui/button, state/notify/notify-context.
 */

import {
  TICKET_NOT_STARTED,
  TICKET_PRIORITY_MAX,
  TICKET_PRIORITY_MIN,
} from '@forge/core';
import type { Ticket, TicketEditBody, TicketSummary } from '@forge/core';
import { useState } from 'react';
import { describeError } from '#/api/describe-error.js';
import { useEditTicket } from '#/api/use-tickets.js';
import { FormField, INPUT_CLASS, TextInput } from '#/components/settings/form-field.js';
import { Button } from '#/components/ui/button.js';
import { useNotify } from '#/state/notify/notify-context.js';

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id) => b.includes(id));

export function TicketEditForm(props: {
  ticket: Ticket;
  /** The project's tickets, to choose what this one waits for. */
  others: readonly TicketSummary[];
  onDone: () => void;
}) {
  const { ticket } = props;
  const edit = useEditTicket(ticket.id);
  const notify = useNotify();
  const notStarted = TICKET_NOT_STARTED.includes(ticket.status);
  const [priority, setPriority] = useState(String(ticket.priority));
  const [waits, setWaits] = useState<readonly string[]>(ticket.blocked_by);
  const [body, setBody] = useState(ticket.body);

  const number = Number(priority);
  const priorityProblem =
    priority.trim() === '' ||
    !Number.isInteger(number) ||
    number < TICKET_PRIORITY_MIN ||
    number > TICKET_PRIORITY_MAX
      ? `Use a whole number from ${TICKET_PRIORITY_MIN} to ${TICKET_PRIORITY_MAX}.`
      : undefined;

  const changes: TicketEditBody = {
    ...(priorityProblem === undefined && number !== ticket.priority
      ? { priority: number }
      : {}),
    ...(sameSet(waits, ticket.blocked_by)
      ? {}
      : { depends_on: waits as TicketEditBody['depends_on'] }),
    ...(notStarted && body !== ticket.body && body.trim() !== '' ? { body } : {}),
  };

  const choices = props.others.filter(
    (other) =>
      other.id !== ticket.id && (other.state !== 'cancelled' || waits.includes(other.id)),
  );

  const toggle = (id: string, on: boolean): void =>
    setWaits(on ? [...waits, id] : waits.filter((w) => w !== id));

  return (
    <form
      aria-label="Edit ticket"
      className="grid max-w-xl gap-4 rounded-lg border border-line p-4"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          props.onDone();
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (Object.keys(changes).length > 0) {
          edit.mutate(changes, {
            onSuccess: () => {
              notify.success(`${ticket.id} updated`);
              props.onDone();
            },
          });
        }
      }}
    >
      <FormField
        id="ticket-priority"
        label="Priority"
        hint="Higher starts first among waiting tickets. 0 is normal."
        error={priorityProblem}
      >
        <TextInput
          id="ticket-priority"
          hasHint
          inputMode="numeric"
          autoComplete="off"
          value={priority}
          error={priorityProblem}
          onChange={(event) => setPriority(event.target.value)}
        />
      </FormField>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Waits for</legend>
        <p id="ticket-waits-hint" className="text-xs text-muted">
          {notStarted
            ? 'This ticket starts only after the ones you tick are done.'
            : 'Work has started, so this ticket cannot be made to wait for more tickets. You can still remove a wait.'}
        </p>
        {choices.length === 0 ? (
          <p className="text-sm text-muted">
            There are no other tickets in this project.
          </p>
        ) : (
          <ul
            aria-describedby="ticket-waits-hint"
            className="grid max-h-48 gap-1 overflow-y-auto"
          >
            {choices.map((other) => {
              const on = waits.includes(other.id);

              return (
                <li key={other.id}>
                  <label className="flex min-h-9 items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={on}
                      disabled={!notStarted && !on}
                      onChange={(event) => toggle(other.id, event.target.checked)}
                    />
                    <span>
                      <span className="font-data">{other.id}</span> {other.title}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      {notStarted ? (
        <FormField id="ticket-body" label="Description">
          <textarea
            id="ticket-body"
            rows={6}
            className={INPUT_CLASS}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </FormField>
      ) : (
        <p className="text-xs text-muted">
          The description is locked: the Worker already has it.
        </p>
      )}

      {edit.isError ? (
        <p role="alert" className="text-sm text-danger">
          {describeError(edit.error).detail}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant="primary"
          status={edit.isPending ? 'loading' : 'idle'}
          disabled={Object.keys(changes).length === 0}
        >
          Save changes
        </Button>
        <Button disabled={edit.isPending} onClick={props.onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
