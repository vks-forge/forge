/**
 * EscalationPermission: a tool call waiting for the owner's yes or no, with the exact command,
 * the Worker's reason, the rule that asked and three ways to answer.
 *
 * Why: on Standard and Full a Worker's install or sensitive edit does not run until the owner
 *   answers, so this card is the whole decision. It shows the exact command or path in a
 *   full-width monospace block (hidden and direction-flipping characters made visible, because
 *   what the owner reads is what they consent to), the Worker's own reason labelled as the
 *   Worker's words (untrusted, plain text, never the title), and one plain sentence on which rule
 *   asked. Allow once is the lead button and covers this one call. "Always for this project"
 *   sits beside the sentence that spells out the rule it would keep (an exact command, or a
 *   folder), and when no safe rule exists the card says why instead of showing a dead button.
 *   Deny stays one click, with an optional note the Worker reads. The three buttons take keys
 *   1 to 3 in the dock. Acting here settles the same item in the dock, the Inbox and the
 *   Worker thread.
 *
 * Exports: EscalationPermission.
 * Depends on: react, components/ui/button, components/ui/field, domain/permission-copy,
 *   schemas/escalation (types), types/escalation-ui.types.
 */

import { useState } from 'react';
import { Button } from '#/components/ui/button.js';
import { INPUT_CLASS } from '#/components/ui/field.js';
import {
  alwaysLine,
  revealInvisible,
  ruleLine,
  wantsLine,
} from '#/domain/permission-copy.js';
import type { EscalationAction } from '#/schemas/escalation.js';
import type {
  EscalationControls,
  PermissionPayload,
} from '#/types/escalation-ui.types.js';

export function EscalationPermission(props: {
  id: string;
  permission: PermissionPayload;
  actions: readonly EscalationAction[];
  controls: EscalationControls;
}) {
  const { permission, controls } = props;
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState('');
  const parts = revealInvisible(permission.what);
  const hidden = parts.filter((part) => part.hidden).length;
  const busy = controls.pending !== null;
  const offered = props.actions.includes('allow_always');
  const spinner = (action: EscalationAction) =>
    controls.pending === action ? ('loading' as const) : ('idle' as const);

  return (
    <div className="grid min-w-0 gap-3">
      <div className="grid min-w-0 gap-1">
        <p className="text-sm font-medium">{wantsLine(permission.action)}</p>
        <pre
          aria-label="Exact call"
          className="min-w-0 whitespace-pre-wrap break-all rounded-lg border border-line bg-hover p-2 font-data text-xs"
        >
          {parts.map((part, index) =>
            part.hidden ? (
              <span
                key={index}
                className="rounded bg-attn-soft px-0.5 font-medium text-attn"
              >
                {part.text}
              </span>
            ) : (
              <span key={index}>{part.text}</span>
            ),
          )}
        </pre>
        {hidden > 0 ? (
          <p role="note" className="text-xs text-attn">
            {hidden === 1
              ? 'This contains 1 hidden character, shown as a marker.'
              : `This contains ${hidden} hidden characters, shown as markers.`}{' '}
            Read it carefully.
          </p>
        ) : null}
      </div>

      {permission.why === undefined ? null : (
        <p className="min-w-0 whitespace-pre-wrap break-words text-sm">
          <span className="font-medium">Why (the Worker’s words): </span>
          {permission.why}
        </p>
      )}

      <p className="text-sm text-muted">
        {ruleLine(permission.reason_code, permission.lane)}
      </p>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            data-dock-option=""
            disabled={busy && controls.pending !== 'allow_once'}
            status={spinner('allow_once')}
            onClick={() => controls.act({ action: 'allow_once' })}
          >
            Allow once
          </Button>
          {offered ? (
            <Button
              variant="quiet"
              data-dock-option=""
              disabled={busy && controls.pending !== 'allow_always'}
              status={spinner('allow_always')}
              onClick={() => controls.act({ action: 'allow_always' })}
            >
              Always for this project
            </Button>
          ) : null}
          <Button
            variant="quiet"
            data-dock-option=""
            disabled={busy && controls.pending !== 'deny'}
            status={spinner('deny')}
            onClick={() =>
              controls.act({
                action: 'deny',
                ...(note.trim() === '' ? {} : { note: note.trim() }),
              })
            }
          >
            Deny
          </Button>
          <button
            type="button"
            aria-expanded={noting}
            onClick={() => setNoting((value) => !value)}
            className="min-h-9 rounded-lg px-2 text-sm text-muted underline-offset-2 hover:text-fg hover:underline"
          >
            {noting ? 'Hide note' : 'Add a note for the Worker'}
          </button>
        </div>
        <p className="min-w-0 break-words text-xs text-muted">
          <span className="font-medium">Allow once</span> lets this one call run.{' '}
          {alwaysLine(permission.always)}
          {offered ? ' You can take it back in Settings, under Tool approvals.' : ''}
        </p>
        {noting ? (
          <div className="grid gap-1">
            <label htmlFor={`${props.id}-note`} className="text-sm font-medium">
              Note for the Worker (optional)
            </label>
            <textarea
              id={`${props.id}-note`}
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className={INPUT_CLASS}
            />
            <p className="text-xs text-muted">Sent with Deny; the Worker reads it.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
