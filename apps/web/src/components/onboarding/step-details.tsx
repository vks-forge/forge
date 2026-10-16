/**
 * StepDetails: the project's name, ticket prefix and base branch, and who is creating it.
 *
 * Why: these are the few choices a project needs that Forge cannot read from the folder, each
 *   prefilled from what it found so the common case is to read and press Next. The name is the
 *   project's id and its web address; the prefix numbers every ticket (`FG-12`) so it says what
 *   it is for; the base branch is where tickets are cut from and merged into. Name and prefix
 *   are checked against the other projects while typing, because a clash found only at Create
 *   costs a trip back. A folder with no branches yet (a new repository) takes the branch name
 *   as text, since Forge creates it. The author is asked once and remembered, so the project's
 *   history says who created it.
 *
 * Exports: StepDetails.
 * Depends on: components/ui/field, types/onboarding.types.
 */

import { Field, INPUT_CLASS } from '#/components/ui/field.js';
import type { ProjectWizard } from '#/types/onboarding.types.js';

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

export function StepDetails(props: { wizard: ProjectWizard }) {
  const { wizard } = props;
  const { draft, shown } = wizard;
  const inspection = wizard.inspection;
  const known = inspection?.branches ?? [];
  const branches = known.includes(draft.baseBranch)
    ? known
    : [draft.baseBranch, ...known].filter((b) => b !== '');

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <Field
          id="project-slug"
          label="Project name"
          hint="Lower case, used in web addresses and as the project's id."
          error={shown.slug}
        >
          <input
            id="project-slug"
            value={draft.slug}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={shown.slug ? true : undefined}
            aria-describedby={describedBy('project-slug', true, Boolean(shown.slug))}
            onChange={(event) => wizard.patch({ slug: event.target.value })}
            className={INPUT_CLASS}
          />
        </Field>
        <Field
          id="project-prefix"
          label="Ticket prefix"
          hint="Starts every ticket id, like FG-12."
          error={shown.prefix}
        >
          <input
            id="project-prefix"
            value={draft.prefix}
            spellCheck={false}
            autoComplete="off"
            maxLength={10}
            aria-invalid={shown.prefix ? true : undefined}
            aria-describedby={describedBy('project-prefix', true, Boolean(shown.prefix))}
            onChange={(event) =>
              wizard.patch({ prefix: event.target.value.toUpperCase() })
            }
            className={`${INPUT_CLASS} font-data uppercase`}
          />
        </Field>
      </div>
      <Field
        id="project-branch"
        label="Base branch"
        hint={
          branches.length === 0 || inspection?.git.state === 'none'
            ? 'Tickets are cut from, and merged into, this branch. Forge creates it when it starts the repository.'
            : inspection?.branches_truncated
              ? 'Tickets are cut from, and merged into, this branch. The list is cut short; the branch must still exist.'
              : 'Tickets are cut from, and merged into, this branch.'
        }
        error={shown.base_branch}
      >
        {branches.length > 0 && inspection?.git.state !== 'none' ? (
          <select
            id="project-branch"
            value={draft.baseBranch}
            aria-invalid={shown.base_branch ? true : undefined}
            aria-describedby={describedBy(
              'project-branch',
              true,
              Boolean(shown.base_branch),
            )}
            onChange={(event) => wizard.patch({ baseBranch: event.target.value })}
            className={`${INPUT_CLASS} font-data text-xs`}
          >
            {branches.map((branch) => (
              <option key={branch} value={branch}>
                {branch}
              </option>
            ))}
          </select>
        ) : (
          <input
            id="project-branch"
            value={draft.baseBranch}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={shown.base_branch ? true : undefined}
            aria-describedby={describedBy(
              'project-branch',
              true,
              Boolean(shown.base_branch),
            )}
            onChange={(event) => wizard.patch({ baseBranch: event.target.value })}
            className={`${INPUT_CLASS} font-data text-xs`}
          />
        )}
      </Field>
      <Field
        id="project-author"
        label="Your name"
        hint="Kept with the project's first settings so its history says who created it."
        error={shown.form}
      >
        <input
          id="project-author"
          value={wizard.author}
          autoComplete="name"
          aria-invalid={shown.form ? true : undefined}
          aria-describedby={describedBy('project-author', true, Boolean(shown.form))}
          onChange={(event) => wizard.setAuthor(event.target.value)}
          className={INPUT_CLASS}
        />
      </Field>
    </div>
  );
}
