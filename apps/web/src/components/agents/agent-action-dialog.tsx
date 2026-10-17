/**
 * AgentActionDialog: confirm a state change on an agent (archive, switch off, reset, duplicate) with a reason.
 *
 * Why: every agent write is a numbered, attributed version, so the server needs a reason even
 *   for a one-click action. The reason starts filled with a sensible sentence the owner can
 *   accept with one press or replace, so the audit trail stays honest without a chore. A reset
 *   throws away edits, so it is a danger-styled confirm that says what is lost; a duplicate also
 *   asks for the copy's name and, on a project screen, whether the copy belongs to the project or
 *   to the company. The dialog stays open on a refusal, with the reason in plain words, so the
 *   owner can fix it and try again.
 *
 * Exports: AgentActionDialog.
 * Depends on: react, components/ui/{modal,button}, components/settings/form-field,
 *   domain/agent-copy, types/agent-ui.types.
 */

import { useState } from 'react';
import { FormField, TextInput } from '#/components/settings/form-field.js';
import { Button } from '#/components/ui/button.js';
import { Modal } from '#/components/ui/modal.js';
import { REASON_MAX, REASON_MIN } from '#/state/use-agent-editor.js';

export function AgentActionDialog(props: {
  title: string;
  description: string;
  confirmLabel: string;
  tone: 'primary' | 'danger';
  initialReason: string;
  /** Present for a duplicate: the copy's starting name. */
  initialName?: string;
  /** Present on a project screen: offer "this project" or "the company" for the copy. */
  chooseTarget?: boolean;
  busy: boolean;
  error: { title: string; detail: string } | null;
  onClose: () => void;
  onConfirm: (value: {
    reason: string;
    name: string;
    target: 'project' | 'company';
  }) => void;
}) {
  const [reason, setReason] = useState(props.initialReason);
  const [name, setName] = useState(props.initialName ?? '');
  const [target, setTarget] = useState<'project' | 'company'>('project');
  const reasonOk =
    reason.trim().length >= REASON_MIN && reason.trim().length <= REASON_MAX;

  const nameOk = props.initialName === undefined || name.trim() !== '';

  return (
    <Modal
      open
      onClose={props.onClose}
      title={props.title}
      description={props.description}
      busy={props.busy}
      primary={
        <Button
          variant={props.tone}
          disabled={!reasonOk || !nameOk}
          status={props.busy ? 'loading' : 'idle'}
          onClick={() =>
            props.onConfirm({ reason: reason.trim(), name: name.trim(), target })
          }
        >
          {props.confirmLabel}
        </Button>
      }
    >
      <div className="grid gap-4">
        {props.initialName === undefined ? null : (
          <FormField
            id="action-name"
            label="Name of the copy"
            error={nameOk ? undefined : 'Give the copy a name.'}
          >
            <TextInput
              id="action-name"
              value={name}
              autoComplete="off"
              error={nameOk ? undefined : 'Give the copy a name.'}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>
        )}
        {props.chooseTarget ? (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Where the copy lives</legend>
            {(
              [
                ['project', 'This project only'],
                ['company', 'The company, for every project'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="copy-target"
                  className="size-4 accent-signal"
                  checked={target === value}
                  onChange={() => setTarget(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
        ) : null}
        <FormField
          id="action-reason"
          label="Reason"
          hint="It goes in the history of the agent."
          error={reasonOk ? undefined : `Use ${REASON_MIN} to ${REASON_MAX} characters.`}
        >
          <TextInput
            id="action-reason"
            value={reason}
            hasHint
            maxLength={REASON_MAX}
            autoComplete="off"
            error={
              reasonOk ? undefined : `Use ${REASON_MIN} to ${REASON_MAX} characters.`
            }
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>
        {props.error ? (
          <p role="alert" className="text-sm text-danger">
            <span className="font-medium">{props.error.title}.</span> {props.error.detail}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
