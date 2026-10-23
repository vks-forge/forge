/**
 * SetupSection: "Before each ticket", the steps Forge runs in a fresh copy of the project before a
 * Worker starts, shown as detected, customised or switched off.
 *
 * Why: Workers cannot install packages, so Forge does it first (d-0180), and what to run depends
 *   on the project's language (d-0176). A project that has said nothing runs the steps Forge
 *   detects, so the section first shows them as read-only rows with the file each came from
 *   ("from uv.lock") and a Customise button, never an empty box the owner must fill in. Customise
 *   copies them into an editor; "Use detected" throws the edits away and follows detection again;
 *   "No setup" saves an explicit empty list for projects that need nothing, which is different
 *   from saying nothing. A project in no known ecosystem shows plain words ("No setup steps
 *   detected"), with a way to add one, and is never an error. The section is the target of
 *   `/p/<slug>/settings/checks#setup`, the link on the "workspace not ready" card, so it scrolls
 *   itself into view when it is opened that way.
 *
 * Exports: SetupSection.
 * Depends on: react, react-router, api/{use-detected, describe-error}, components/ui/{button,field},
 *   routes/project-settings/setup-editor, domain/setup-draft, types/project-settings.types.
 */

import { useEffect, useRef } from 'react';
import { useLocation, useParams } from 'react-router';
import { describeError } from '#/api/describe-error.js';
import { useDetected } from '#/api/use-detected.js';
import { Button } from '#/components/ui/button.js';
import { Switch } from '#/components/ui/field.js';
import {
  blankSetupRow,
  cacheLine,
  rowsFromSteps,
  setupSource,
} from '#/domain/setup-draft.js';
import { SetupEditor } from '#/routes/project-settings/setup-editor.js';
import type { FieldDraft, SetupRow } from '#/types/project-settings.types.js';

function Detected(props: {
  steps: readonly {
    name: string;
    command: string;
    inputs: readonly string[];
    cache_outputs: readonly string[];
    cache_env: Readonly<Record<string, string>>;
  }[];
}) {
  return (
    <ul aria-label="Detected setup steps" className="grid gap-1">
      {props.steps.map((step) => (
        <li
          key={step.name}
          className="grid gap-0.5 rounded-lg bg-hover px-3 py-2 text-sm sm:flex sm:flex-wrap sm:items-baseline sm:gap-x-3"
        >
          <span className="font-medium">{step.name}</span>
          <code className="min-w-0 break-all font-data text-xs">{step.command}</code>
          {setupSource(step) === undefined ? null : (
            <span className="text-xs text-muted">{setupSource(step)}</span>
          )}
          <span className="text-xs text-muted">{cacheLine(step)}</span>
        </li>
      ))}
    </ul>
  );
}

export function SetupSection(props: {
  field: FieldDraft<readonly SetupRow[]>;
  onChange: (next: FieldDraft<readonly SetupRow[]>) => void;
  error?: string | undefined;
  disabled: boolean;
}) {
  const { field } = props;
  const { slug = '' } = useParams();
  const detected = useDetected(slug);
  const steps = detected.data?.setup ?? [];
  const rootRef = useRef<HTMLDivElement>(null);
  const { hash } = useLocation();

  useEffect(() => {
    if (hash === '#setup') {
      rootRef.current?.scrollIntoView?.({ block: 'start' });
    }
  }, [hash]);

  const customise = (): void =>
    props.onChange({
      overridden: true,
      value: steps.length > 0 ? rowsFromSteps(steps) : [blankSetupRow()],
    });

  const followDetected = (): void => props.onChange({ overridden: false, value: [] });
  const noSetup = field.overridden && field.value.length === 0;
  const editing = field.overridden && field.value.length > 0;

  return (
    <div
      ref={rootRef}
      id="setup"
      className="grid scroll-mt-4 gap-2 border-b border-line py-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p id="setup-title" className="text-sm font-medium">
            Before each ticket
          </p>
          <p className="text-xs text-muted">
            Workers cannot install packages, so Forge does it first, in a fresh copy of
            the project.
          </p>
        </div>
        {editing ? null : (
          <label className="flex shrink-0 items-center gap-2 text-xs text-muted">
            <Switch
              checked={noSetup}
              disabled={props.disabled}
              label="No setup"
              onChange={(on) =>
                on ? props.onChange({ overridden: true, value: [] }) : followDetected()
              }
            />
            <span aria-hidden="true">No setup</span>
          </label>
        )}
      </div>

      {editing ? (
        <>
          <SetupEditor
            rows={field.value}
            disabled={props.disabled}
            onChange={(value) => props.onChange({ overridden: true, value })}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="quiet" disabled={props.disabled} onClick={followDetected}>
              Use detected
            </Button>
            <p className="min-w-0 text-xs text-muted">
              Drops your edits and follows what Forge detects in the project.
            </p>
          </div>
        </>
      ) : noSetup ? (
        <div className="grid gap-2">
          <p className="rounded-lg bg-hover px-3 py-2 text-sm">
            No setup. Workers start on a copy with nothing installed, so checks that need
            packages will fail.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="quiet" disabled={props.disabled} onClick={customise}>
              Add a step
            </Button>
            <Button variant="quiet" disabled={props.disabled} onClick={followDetected}>
              Use detected
            </Button>
          </div>
        </div>
      ) : detected.isPending ? (
        <p role="status" className="rounded-lg bg-hover px-3 py-2 text-sm">
          Looking at the project’s files…
        </p>
      ) : detected.isError ? (
        <div className="grid gap-2">
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm">
            Could not look at the project’s files. {describeError(detected.error).detail}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="quiet"
              status={detected.isFetching ? 'loading' : 'idle'}
              onClick={() => void detected.refetch()}
            >
              Try again
            </Button>
            <Button variant="quiet" disabled={props.disabled} onClick={customise}>
              Add a step
            </Button>
          </div>
        </div>
      ) : steps.length === 0 ? (
        <div className="grid gap-2">
          <p className="rounded-lg bg-hover px-3 py-2 text-sm">
            No setup steps detected. Forge starts Workers on a copy with nothing
            installed.
          </p>
          <div>
            <Button variant="quiet" disabled={props.disabled} onClick={customise}>
              Add a step
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          <Detected steps={steps} />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="quiet" disabled={props.disabled} onClick={customise}>
              Customise
            </Button>
            <p className="min-w-0 text-xs text-muted">
              Detected from the project’s files. It follows later changes until you
              customise it.
            </p>
          </div>
        </div>
      )}

      {props.error ? (
        <p id="setup-error" role="alert" className="text-xs text-danger">
          {props.error}
        </p>
      ) : null}
    </div>
  );
}
