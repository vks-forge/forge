/**
 * PlanTicketEditor: the draft list for light edits to a ready plan's tickets.
 *
 * Why: the owner's small fixes before approval (a clearer title, a higher priority, a ticket
 *   dropped, one moved earlier) should not need a round trip to the Director. Each row has a
 *   title box, a priority Picker, up and down buttons (reordering by keyboard, no dragging
 *   required), a care-level Picker (Express, Standard, Full, each with its plain-words gloss) and Remove; a removed row stays visible, struck through, with Restore, until the
 *   edits are saved, so a slip costs nothing. Save sends one request for the whole batch and
 *   stays disabled until something changed; Discard drops the draft. A refusal from the server
 *   (for example a removed ticket others depend on) is shown right here in words and the draft
 *   is kept, so nothing typed is lost. A care level the owner chose (now or earlier) is marked "Set by you": the
 *   automatic size checks then leave it alone, though protected files (tier C) still run in Full (d-0177). A ticket the Director gave pipeline changes lists them under its row,
 *   each with a button to take it off (never to add one), undoable until saved.
 *
 * Exports: PlanTicketEditor.
 * Depends on: react, lucide-react, components/ui/button, components/ui/field, components/ui/picker,
 *   routes/card/plan/plan-pipeline-ops, domain/plan-edit, domain/priority, domain/plain-words,
 *   domain/pipeline-copy, types/plan.types.
 */

import { ArrowDown, ArrowUp, RotateCcw, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '#/components/ui/button.js';
import { INPUT_CLASS } from '#/components/ui/field.js';
import { Picker } from '#/components/ui/picker.js';
import { LANE_LABEL, LANE_ORDER } from '#/domain/pipeline-copy.js';
import { careGloss } from '#/domain/plain-words.js';
import { moveDraft, patchDraft, toggleDropOp } from '#/domain/plan-edit.js';
import { PRIORITY_LABEL, PRIORITY_ORDER } from '#/domain/priority.js';
import { PlanOpsEditor } from '#/routes/card/plan/plan-pipeline-ops.js';
import type { PlanLane, PlanPriority, PlanTicket } from '#/schemas/plan.js';
import type { DraftTicket } from '#/types/plan.types.js';

const PRIORITIES = PRIORITY_ORDER.map((value) => ({
  value,
  label: PRIORITY_LABEL[value],
}));

const LANES = LANE_ORDER.map((value) => ({
  value,
  label: LANE_LABEL[value],
  description: careGloss(value),
}));

function IconButton(props: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className="grid size-9 place-items-center rounded-lg border border-line bg-surface text-muted transition-colors duration-150 hover:bg-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
    >
      {props.children}
    </button>
  );
}

export function PlanTicketEditor(props: {
  tickets: readonly PlanTicket[];
  draft: readonly DraftTicket[];
  onChange: (next: readonly DraftTicket[]) => void;
  canSave: boolean;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const { draft, onChange } = props;
  const planned = new Map(props.tickets.map((t) => [t.key, t]));

  return (
    <div className="grid gap-3">
      <ol aria-label="Tickets being edited" className="grid gap-2">
        {draft.map((ticket, index) => (
          <li
            key={ticket.key}
            data-ticket={ticket.key}
            className={`grid gap-2 rounded-xl border border-line bg-surface p-3 sm:grid-cols-[auto_minmax(0,1fr)_9rem_9rem_auto] sm:items-center ${
              ticket.removed ? 'opacity-60' : ''
            }`}
          >
            <span className="w-fit rounded-md bg-hover px-1.5 font-data text-xs">
              {ticket.key}
            </span>
            <input
              type="text"
              aria-label={`Title of ${ticket.key}`}
              value={ticket.title}
              disabled={ticket.removed}
              onChange={(event) =>
                onChange(patchDraft(draft, ticket.key, { title: event.target.value }))
              }
              className={`${INPUT_CLASS} ${ticket.removed ? 'line-through' : ''}`}
            />
            <Picker
              label={`Priority of ${ticket.key}`}
              size="sm"
              disabled={ticket.removed}
              items={PRIORITIES}
              value={ticket.priority}
              onChange={(priority) =>
                onChange(
                  patchDraft(draft, ticket.key, { priority: priority as PlanPriority }),
                )
              }
            />
            <Picker
              label={`Care level of ${ticket.key}`}
              size="sm"
              disabled={ticket.removed}
              items={LANES}
              value={ticket.lane}
              onChange={(lane) =>
                onChange(patchDraft(draft, ticket.key, { lane: lane as PlanLane }))
              }
            />
            <div className="flex gap-1.5">
              <IconButton
                label={`Move ${ticket.key} up`}
                disabled={index === 0}
                onClick={() => onChange(moveDraft(draft, ticket.key, -1))}
              >
                <ArrowUp aria-hidden="true" className="size-4" />
              </IconButton>
              <IconButton
                label={`Move ${ticket.key} down`}
                disabled={index === draft.length - 1}
                onClick={() => onChange(moveDraft(draft, ticket.key, 1))}
              >
                <ArrowDown aria-hidden="true" className="size-4" />
              </IconButton>
              <IconButton
                label={ticket.removed ? `Restore ${ticket.key}` : `Remove ${ticket.key}`}
                onClick={() =>
                  onChange(patchDraft(draft, ticket.key, { removed: !ticket.removed }))
                }
              >
                {ticket.removed ? (
                  <RotateCcw aria-hidden="true" className="size-4" />
                ) : (
                  <Trash2 aria-hidden="true" className="size-4" />
                )}
              </IconButton>
            </div>
            {ticket.removed ? null : (
              <p className="text-xs text-muted sm:col-span-full">
                {careGloss(ticket.lane)}
                {ticket.lane !== planned.get(ticket.key)?.lane ||
                planned.get(ticket.key)?.lane_by_owner === true ? (
                  <>
                    {' '}
                    <span className="rounded-md bg-hover px-1.5 font-medium text-fg">
                      Set by you
                    </span>
                  </>
                ) : null}
                {ticket.lane === 'full' ? null : ' Protected files still run in Full.'}
              </p>
            )}
            {planned.get(ticket.key) === undefined ? null : (
              <PlanOpsEditor
                ticket={planned.get(ticket.key) as PlanTicket}
                dropped={ticket.dropOps}
                disabled={ticket.removed}
                onToggle={(position) =>
                  onChange(toggleDropOp(draft, ticket.key, position))
                }
              />
            )}
          </li>
        ))}
      </ol>

      {props.error !== null ? (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm">
          {props.error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={!props.canSave}
          status={props.saving ? 'loading' : 'idle'}
          onClick={props.onSave}
        >
          Save changes
        </Button>
        <Button disabled={props.saving} onClick={props.onDiscard}>
          Discard changes
        </Button>
      </div>
    </div>
  );
}
