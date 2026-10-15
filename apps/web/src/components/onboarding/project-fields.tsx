/**
 * ProjectFields: name, ticket prefix, base branch, git host, checks and who is creating it.
 *
 * Why: after the folder check these are the choices a project needs, each prefilled from what
 *   Forge found so the common case is to read and press Create. The prefix numbers every
 *   ticket (`FG-12`) so it says what it is for; the base branch is a pick from the real
 *   branches (typing is still possible when the list was cut short); the checks are what the
 *   gates re-run, shown as the editable list the project settings screen uses. The name is
 *   asked once and remembered for the audit trail on this machine's session.
 *
 * Exports: ProjectFields.
 * Depends on: routes/project-settings/checks-editor, components/onboarding/git-host-fields,
 *   components/ui/field, @forge/core (type), types/onboarding.types.
 */

import type { ProjectInspection } from '@forge/core';
import { GitHostFields } from '#/components/onboarding/git-host-fields.js';
import { Field, INPUT_CLASS } from '#/components/ui/field.js';
import { ChecksEditor } from '#/routes/project-settings/checks-editor.js';
import type { ProjectDraft, ProjectField } from '#/types/onboarding.types.js';

function describedBy(
  id: string,
  hasHint: boolean,
  hasError: boolean,
): string | undefined {
  const parts = [hasHint ? `${id}-hint` : '', hasError ? `${id}-error` : ''].filter(
    Boolean,
  );

  return parts.length > 0 ? parts.join(' ') : undefined;
}

export function ProjectFields(props: {
  inspection: ProjectInspection;
  draft: ProjectDraft;
  errors: Partial<Record<ProjectField, string>>;
  author: string;
  onAuthor: (name: string) => void;
  onChange: (patch: Partial<ProjectDraft>) => void;
}) {
  const { draft, errors, inspection } = props;
  const branches = inspection.branches.includes(draft.baseBranch)
    ? inspection.branches
    : [draft.baseBranch, ...inspection.branches].filter((b) => b !== '');

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <Field
          id="project-slug"
          label="Project name"
          hint="Lower case, used in web addresses and as the project's id."
          error={errors.slug}
        >
          <input
            id="project-slug"
            value={draft.slug}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={errors.slug ? true : undefined}
            aria-describedby={describedBy('project-slug', true, Boolean(errors.slug))}
            onChange={(event) => props.onChange({ slug: event.target.value })}
            className={INPUT_CLASS}
          />
        </Field>
        <Field
          id="project-prefix"
          label="Ticket prefix"
          hint="Starts every ticket id, like FG-12."
          error={errors.prefix}
        >
          <input
            id="project-prefix"
            value={draft.prefix}
            spellCheck={false}
            autoComplete="off"
            maxLength={10}
            aria-invalid={errors.prefix ? true : undefined}
            aria-describedby={describedBy('project-prefix', true, Boolean(errors.prefix))}
            onChange={(event) =>
              props.onChange({ prefix: event.target.value.toUpperCase() })
            }
            className={`${INPUT_CLASS} font-data uppercase`}
          />
        </Field>
      </div>
      <Field
        id="project-branch"
        label="Base branch"
        hint={
          inspection.branches_truncated
            ? 'Tickets are cut from, and merged into, this branch. The list is cut short; the branch must still exist.'
            : 'Tickets are cut from, and merged into, this branch.'
        }
        error={errors.base_branch}
      >
        <select
          id="project-branch"
          value={draft.baseBranch}
          aria-invalid={errors.base_branch ? true : undefined}
          aria-describedby={describedBy(
            'project-branch',
            true,
            Boolean(errors.base_branch),
          )}
          onChange={(event) => props.onChange({ baseBranch: event.target.value })}
          className={`${INPUT_CLASS} font-data text-xs`}
        >
          {branches.map((branch) => (
            <option key={branch} value={branch}>
              {branch}
            </option>
          ))}
        </select>
      </Field>
      <GitHostFields draft={draft} errors={errors} onChange={props.onChange} />
      <div className="grid gap-2">
        <h3 className="text-sm font-medium">Checks</h3>
        <p className="text-xs text-muted">
          Commands Forge re-runs on every ticket before it merges. Found in your
          repository; change them if they are wrong.
        </p>
        <ChecksEditor
          checks={draft.checks}
          onChange={(checks) => props.onChange({ checks })}
        />
        {errors.checks ? (
          <p role="alert" className="text-xs text-danger">
            {errors.checks}
          </p>
        ) : null}
      </div>
      <Field
        id="project-author"
        label="Your name"
        hint="Kept with the project's first settings so its history says who created it."
        error={errors.form}
      >
        <input
          id="project-author"
          value={props.author}
          autoComplete="name"
          aria-invalid={errors.form ? true : undefined}
          aria-describedby={describedBy('project-author', true, Boolean(errors.form))}
          onChange={(event) => props.onAuthor(event.target.value)}
          className={INPUT_CLASS}
        />
      </Field>
    </div>
  );
}
