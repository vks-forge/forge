/**
 * StepReview: everything the project will be, in one place, before anything is created.
 *
 * Why: creating a project writes to the person's machine (a repository may be started, a
 *   first commit made, settings and memory stored), so the last step restates every choice in
 *   plain words, each with "Edit" that jumps to its step (Nielsen 6, 3), and only then offers
 *   Create. While it runs the step says what is happening, since a snapshot of a big folder
 *   takes a moment, and a refusal that no field owns shows here with what to do.
 *
 * Exports: StepReview, gitSummary().
 * Depends on: components/settings/form-field, components/ui/button, domain/{format-bytes,project-draft},
 *   types/onboarding.types.
 */

import { LoaderCircle } from 'lucide-react';
import { Notice } from '#/components/settings/form-field.js';
import { Button } from '#/components/ui/button.js';
import { formatBytes } from '#/domain/format-bytes.js';
import type { ProjectStepId, ProjectWizard } from '#/types/onboarding.types.js';

/** One sentence for what happens to git when the project is created. */
export function gitSummary(wizard: ProjectWizard): string {
  const git = wizard.inspection?.git;
  const snapshot = wizard.inspection?.snapshot;

  if (!git) {
    return '';
  }

  if (git.state === 'none') {
    return wizard.draft.gitSetup === 'snapshot'
      ? `Start a local repository and commit a snapshot of ${snapshot ? `${snapshot.files.toLocaleString()} files (${formatBytes(snapshot.bytes)})` : 'the files'}`
      : 'Start an empty local repository; Forge waits for your first commit';
  }

  if (git.state === 'inside_repo') {
    return wizard.draft.scope === 'root'
      ? `Use the repository's top folder, ${git.repo_root ?? ''}`
      : `Use only the subfolder ${git.subfolder ?? ''} of the repository`;
  }

  return git.has_commits
    ? 'Use the existing repository'
    : 'Use the existing repository; waits for its first commit';
}

function Row(props: {
  label: string;
  edit: ProjectStepId;
  onEdit: (step: ProjectStepId) => void;
  disabled: boolean;
  children: string;
}) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 border-b border-line py-3 last:border-b-0">
      <dt className="text-sm text-muted">{props.label}</dt>
      <dd className="min-w-0 break-words text-sm">{props.children}</dd>
      <Button
        variant="quiet"
        className="min-h-8 px-2 text-xs"
        disabled={props.disabled}
        aria-label={`Edit ${props.label.toLowerCase()}`}
        onClick={() => props.onEdit(props.edit)}
      >
        Edit
      </Button>
    </div>
  );
}

export function StepReview(props: {
  wizard: ProjectWizard;
  onEdit: (step: ProjectStepId) => void;
}) {
  const { wizard } = props;
  const { draft } = wizard;
  const checks = draft.checks.map((c) => c.name).join(', ');
  const merge =
    draft.host === 'github'
      ? `Pull requests on ${draft.repo}`
      : `Merge into ${draft.baseBranch} on this computer`;

  return (
    <div className="grid gap-4">
      <dl className="rounded-xl border border-line bg-surface px-4">
        <Row
          label="Folder"
          edit="folder"
          onEdit={props.onEdit}
          disabled={wizard.creating}
        >
          {wizard.folder}
        </Row>
        <Row label="Git" edit="git" onEdit={props.onEdit} disabled={wizard.creating}>
          {gitSummary(wizard)}
        </Row>
        <Row
          label="Verified work"
          edit="git"
          onEdit={props.onEdit}
          disabled={wizard.creating}
        >
          {merge}
        </Row>
        <Row
          label="Project"
          edit="details"
          onEdit={props.onEdit}
          disabled={wizard.creating}
        >
          {`${draft.slug} · tickets ${draft.prefix}-1, ${draft.prefix}-2 … · base ${draft.baseBranch}`}
        </Row>
        <Row
          label="Checks"
          edit="checks"
          onEdit={props.onEdit}
          disabled={wizard.creating}
        >
          {draft.checks.length > 0 ? `${draft.checks.length}: ${checks}` : 'None yet'}
        </Row>
      </dl>
      {wizard.formProblem ? (
        <Notice tone="error" title={wizard.formProblem.message}>
          {wizard.formProblem.fix}
        </Notice>
      ) : null}
      {wizard.creating ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          {wizard.inspection?.git.state === 'none' && draft.gitSetup === 'snapshot'
            ? 'Starting the repository and taking the first snapshot. A large folder takes a moment…'
            : 'Creating the project…'}
        </p>
      ) : (
        <p className="text-xs text-muted">
          Nothing has been created yet. Create project makes the project and, where
          needed, starts the repository.
        </p>
      )}
    </div>
  );
}
