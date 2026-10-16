/**
 * StepGit: what Forge found about git in the folder, and the choices that follow from it.
 *
 * Why: Forge works in isolated copies of a folder and merges verified work back, which needs
 *   git. Folders differ, so this step says what is true and asks only what the folder needs
 *   (d-0124). A folder with no repository: Forge will start a local one, either with a snapshot
 *   commit of the files already there (default; the file count and size are shown first, and a
 *   .gitignore is added when there is none) or init only, leaving the first commit to the person.
 *   A folder inside someone else's repository: use the repository's top folder (default) or
 *   scope the project to this subfolder; Forge never nests a second repository. An existing
 *   repository is confirmed. A GitHub remote offers pull requests through a connection; any
 *   other case merges locally. Nothing here writes anything: it is a plan, created at the end.
 *
 * Exports: StepGit.
 * Depends on: lucide-react, components/onboarding/{choice-card,github-fields}, components/settings/form-field,
 *   domain/{format-bytes,project-draft}, types/onboarding.types.
 */

import { Check } from 'lucide-react';
import { ChoiceCard } from '#/components/onboarding/choice-card.js';
import { GitHubFields } from '#/components/onboarding/github-fields.js';
import { Notice } from '#/components/settings/form-field.js';
import { formatBytes } from '#/domain/format-bytes.js';
import type { ProjectWizard } from '#/types/onboarding.types.js';

function SnapshotChoices(props: { wizard: ProjectWizard }) {
  const { wizard } = props;
  const snapshot = wizard.inspection?.snapshot ?? null;

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">
        How should Forge start the repository?
      </legend>
      <ChoiceCard
        name="git-setup"
        value="snapshot"
        checked={wizard.draft.gitSetup === 'snapshot'}
        onChange={() => wizard.patch({ gitSetup: 'snapshot' })}
        title="Snapshot commit"
        badge="Recommended"
      >
        {snapshot
          ? `Commits the ${snapshot.truncated ? 'more than ' : ''}${snapshot.files.toLocaleString()} files already here (${snapshot.truncated ? 'over ' : ''}${formatBytes(snapshot.bytes)}) as the starting point. `
          : 'Commits the files already here as the starting point. '}
        {snapshot?.has_gitignore === false
          ? 'A standard .gitignore is added first so dependencies and build output stay out.'
          : 'Your existing .gitignore is respected.'}
      </ChoiceCard>
      <ChoiceCard
        name="git-setup"
        value="init_only"
        checked={wizard.draft.gitSetup === 'init_only'}
        onChange={() => wizard.patch({ gitSetup: 'init_only' })}
        title="Init only"
      >
        Creates an empty repository. Forge waits for your first commit before it starts
        any work.
      </ChoiceCard>
      {snapshot?.truncated ? (
        <p className="text-xs text-muted">
          This folder is large. Add a .gitignore for dependencies and build output first,
          or choose Init only, if the snapshot is refused.
        </p>
      ) : null}
    </fieldset>
  );
}

function ScopeChoices(props: { wizard: ProjectWizard }) {
  const { wizard } = props;
  const git = wizard.inspection?.git;

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">
        Which part of the repository is the project?
      </legend>
      <ChoiceCard
        name="git-scope"
        value="root"
        checked={wizard.draft.scope === 'root'}
        onChange={() => wizard.patch({ scope: 'root' })}
        title="Use the repository's top folder"
        badge="Recommended"
      >
        Registers <span className="font-data text-xs">{git?.repo_root}</span> so every
        part of the repository belongs to the project.
      </ChoiceCard>
      <ChoiceCard
        name="git-scope"
        value="subfolder"
        checked={wizard.draft.scope === 'subfolder'}
        onChange={() => wizard.patch({ scope: 'subfolder' })}
        title="Only this subfolder"
      >
        Work, checks and the gate stay inside{' '}
        <span className="font-data text-xs">{git?.subfolder}</span>. Branches and merges
        still use the whole repository.
      </ChoiceCard>
    </fieldset>
  );
}

function Remote(props: { wizard: ProjectWizard }) {
  const { wizard } = props;
  const remote = wizard.inspection?.git.remote ?? null;

  if (!remote) {
    return (
      <p className="text-sm text-muted">
        No remote is set, so verified work merges into{' '}
        <span className="font-data text-xs">
          {wizard.draft.baseBranch || 'the base branch'}
        </span>{' '}
        on this computer. You can add GitHub later.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Remote</dt>
        <dd className="min-w-0 break-all font-data text-xs leading-5">
          {remote.name} · {remote.url}
        </dd>
      </dl>
      {remote.github ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">
            Where does verified work go?
          </legend>
          <ChoiceCard
            name="git-host"
            value="local"
            checked={wizard.draft.host === 'local'}
            onChange={() => wizard.patch({ host: 'local' })}
            title="Merge locally"
            badge="Recommended"
          >
            Verified work merges into the base branch on this computer. No account needed.
          </ChoiceCard>
          <ChoiceCard
            name="git-host"
            value="github"
            checked={wizard.draft.host === 'github'}
            onChange={() => wizard.patch({ host: 'github' })}
            title="Pull requests on GitHub"
          >
            Opens pull requests on{' '}
            <span className="font-data text-xs">
              {remote.github.owner}/{remote.github.repo}
            </span>{' '}
            through one of your GitHub connections.
          </ChoiceCard>
          {wizard.draft.host === 'github' ? (
            <GitHubFields
              draft={wizard.draft}
              errors={wizard.shown}
              onChange={wizard.patch}
            />
          ) : null}
        </fieldset>
      ) : (
        <p className="text-sm text-muted">
          This remote is not on GitHub, so verified work merges into the base branch on
          this computer.
        </p>
      )}
    </div>
  );
}

export function StepGit(props: { wizard: ProjectWizard }) {
  const { wizard } = props;
  const git = wizard.inspection?.git;

  if (!git) {
    return null;
  }

  return (
    <div className="grid gap-6">
      {git.state === 'repo' ? (
        <p role="status" className="flex items-start gap-2 text-sm">
          <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-good" />
          <span>
            Git repository found
            {wizard.inspection?.current_branch
              ? `, on branch ${wizard.inspection.current_branch}`
              : ''}
            . Forge will work on copies of it and leave your folder as it is.
          </span>
        </p>
      ) : null}
      {git.state === 'none' ? (
        <Notice tone="info" title="This folder is not a git repository yet">
          Forge needs git to work on isolated copies of your files and to merge verified
          work. It will start a local repository here when you create the project.
        </Notice>
      ) : null}
      {git.state === 'inside_repo' ? (
        <Notice tone="info" title="This folder is inside a git repository">
          Forge never starts a second repository inside another one. Choose what the
          project covers.
        </Notice>
      ) : null}
      {git.state === 'repo' && !git.has_commits ? (
        <Notice tone="warn" title="This repository has no commits yet">
          You can create the project now; Forge will wait for your first commit before it
          starts any work.
        </Notice>
      ) : null}
      {git.state === 'none' ? <SnapshotChoices wizard={wizard} /> : null}
      {git.state === 'inside_repo' ? <ScopeChoices wizard={wizard} /> : null}
      {git.state !== 'none' && git.dirty ? (
        <p className="text-xs text-muted">
          The folder has uncommitted changes. Forge never touches them; if a merge would,
          it asks you first.
        </p>
      ) : null}
      {git.state === 'none' ? (
        <p className="text-sm text-muted">
          No remote: verified work merges into the base branch on this computer. You can
          add GitHub later.
        </p>
      ) : (
        <Remote wizard={wizard} />
      )}
    </div>
  );
}
