/**
 * FolderCheck: the repository folder box, its "Check folder" button and what Forge found there.
 *
 * Why: the folder is the one input every other field depends on, and the one most likely to
 *   be wrong (a subfolder, a folder that is not a repository, a typo). Checking it first, with
 *   a dry run that creates nothing, lets Forge say what it found (the checked-out branch, how
 *   many branches, the languages and checks it recognises) before the person fills in anything
 *   else, and refuse a bad folder next to the box with what to do about it. Enter in the box
 *   runs the check, so the keyboard path is type, Enter, review.
 *
 * Exports: FolderCheck.
 * Depends on: lucide-react, @forge/core (ProjectInspection, type), components/ui/{button,field},
 *   types/onboarding.types.
 */

import { Check, FolderSearch } from 'lucide-react';
import type { ProjectInspection } from '@forge/core';
import { Button } from '#/components/ui/button.js';
import { Field, INPUT_CLASS } from '#/components/ui/field.js';
import type { FieldProblem } from '#/types/onboarding.types.js';

function Facts(props: { inspection: ProjectInspection }) {
  const { inspection } = props;
  const rows: [string, string][] = [
    ['Git repository', 'Yes, this is the top folder'],
    [
      'Checked-out branch',
      inspection.current_branch ?? 'None (detached); pick a branch below',
    ],
    [
      'Branches',
      `${inspection.branches.length}${inspection.branches_truncated ? ' shown, more exist' : ''}`,
    ],
    [
      'Languages found',
      inspection.ecosystems.length > 0
        ? inspection.ecosystems.join(', ')
        : 'None recognised; you can still add checks by hand',
    ],
    [
      'Checks suggested',
      inspection.checks.length > 0
        ? inspection.checks.map((c) => c.name).join(', ')
        : 'None found in this folder',
    ],
  ];

  return (
    <div
      role="status"
      className="grid gap-3 rounded-xl border border-good bg-surface p-4"
    >
      <p className="flex items-center gap-2 text-sm font-medium">
        <Check aria-hidden="true" className="size-4 text-good" />
        This folder can be a project
      </p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd className="min-w-0 break-words font-data text-xs leading-5">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function FolderCheck(props: {
  folder: string;
  onFolderChange: (folder: string) => void;
  onCheck: () => void;
  checking: boolean;
  inspection: ProjectInspection | null;
  problem: FieldProblem | null;
}) {
  const { problem } = props;

  return (
    <div className="grid gap-3">
      <Field
        id="project-folder"
        label="Repository folder"
        hint="The full path of your clone on this machine. Forge only reads it to check; nothing is changed."
        error={problem ? `${problem.message} ${problem.fix}` : undefined}
      >
        <div className="flex flex-wrap gap-2">
          <input
            id="project-folder"
            value={props.folder}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            placeholder="C:\code\my-app"
            aria-invalid={problem ? true : undefined}
            aria-describedby={`project-folder-hint${problem ? ' project-folder-error' : ''}`}
            onChange={(event) => props.onFolderChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                props.onCheck();
              }
            }}
            className={`${INPUT_CLASS} min-w-0 flex-1 basis-60 font-data text-xs`}
          />
          <Button
            onClick={props.onCheck}
            disabled={props.folder.trim() === ''}
            status={props.checking ? 'loading' : 'idle'}
          >
            <FolderSearch aria-hidden="true" className="size-4" />
            Check folder
          </Button>
        </div>
      </Field>
      {props.inspection ? <Facts inspection={props.inspection} /> : null}
    </div>
  );
}
