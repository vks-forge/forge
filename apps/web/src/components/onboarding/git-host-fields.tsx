/**
 * GitHostFields: where merged work goes: a local remote folder, or a GitHub repository.
 *
 * Why: Forge merges a ticket's branch into the base branch through a "git host". Local means a
 *   bare repository on this machine (no network, no account); GitHub means a repository reached
 *   through a connection (a GitHub App) and its installation id, with pull requests. The
 *   choice changes which fields are needed, so it is two plain options with one sentence each
 *   and only the chosen option's fields show. With no GitHub connection the option explains
 *   what is missing instead of offering an empty list.
 *
 * Exports: GitHostFields.
 * Depends on: react-router, api/use-settings-data, components/ui/field, types/onboarding.types.
 */

import { Link } from 'react-router';
import { useGithubConnections } from '#/api/use-settings-data.js';
import { Field, INPUT_CLASS } from '#/components/ui/field.js';
import type {
  ProjectDraft,
  ProjectField,
  ProjectHostChoice,
} from '#/types/onboarding.types.js';

const HOSTS: readonly { value: ProjectHostChoice; label: string; help: string }[] = [
  {
    value: 'local',
    label: 'Local git only',
    help: 'Merges go into a bare repository on this machine. No account needed.',
  },
  {
    value: 'github',
    label: 'GitHub',
    help: 'Merges go through a repository on GitHub, using one of your connections.',
  },
];

export function GitHostFields(props: {
  draft: ProjectDraft;
  errors: Partial<Record<ProjectField, string>>;
  onChange: (patch: Partial<ProjectDraft>) => void;
}) {
  const { draft, errors } = props;
  const connections = useGithubConnections();
  const active = (connections.data ?? []).filter((c) => c.status === 'active');

  return (
    <div className="grid gap-4">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Where merged work goes</legend>
        {HOSTS.map((option) => (
          <label
            key={option.value}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface p-3 transition-colors duration-150 has-[:checked]:border-signal has-[:checked]:bg-signal-soft hover:border-faint"
          >
            <input
              type="radio"
              name="git-host"
              value={option.value}
              checked={draft.host === option.value}
              onChange={() => props.onChange({ host: option.value })}
              className="mt-1 size-4 accent-[var(--signal)]"
            />
            <span className="grid gap-0.5 text-sm">
              <span className="font-medium">{option.label}</span>
              <span className="text-muted">{option.help}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {draft.host === 'local' ? (
        <Field
          id="project-remote"
          label="Remote repository"
          hint="A bare repository Forge merges into (made with `git init --bare`). A path relative to your clone also works."
          error={errors.remote_path}
        >
          <input
            id="project-remote"
            value={draft.remotePath}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={errors.remote_path ? true : undefined}
            aria-describedby={`project-remote-hint${errors.remote_path ? ' project-remote-error' : ''}`}
            onChange={(event) => props.onChange({ remotePath: event.target.value })}
            className={`${INPUT_CLASS} font-data text-xs`}
          />
        </Field>
      ) : (
        <div className="grid gap-4">
          {connections.isSuccess && active.length === 0 ? (
            <p className="text-sm text-muted">
              There is no active GitHub connection yet.{' '}
              <Link className="font-medium text-signal underline" to="/settings/github">
                Add one in Forge settings
              </Link>
              , or choose local git only.
            </p>
          ) : (
            <Field
              id="project-connection"
              label="GitHub connection"
              error={errors.connection}
            >
              <select
                id="project-connection"
                value={draft.connectionId}
                aria-invalid={errors.connection ? true : undefined}
                aria-describedby={
                  errors.connection ? 'project-connection-error' : undefined
                }
                onChange={(event) => props.onChange({ connectionId: event.target.value })}
                className={INPUT_CLASS}
              >
                <option value="">
                  {connections.isPending ? 'Loading connections' : 'Choose a connection'}
                </option>
                {active.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.account}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="project-repo"
              label="Repository"
              hint="owner/name, as in the GitHub URL."
              error={errors.repo}
            >
              <input
                id="project-repo"
                value={draft.repo}
                spellCheck={false}
                autoComplete="off"
                aria-invalid={errors.repo ? true : undefined}
                aria-describedby={`project-repo-hint${errors.repo ? ' project-repo-error' : ''}`}
                onChange={(event) => props.onChange({ repo: event.target.value })}
                className={`${INPUT_CLASS} font-data text-xs`}
              />
            </Field>
            <Field
              id="project-installation"
              label="Installation id"
              hint="The number at the end of the App's installation URL."
              error={errors.installation_id}
            >
              <input
                id="project-installation"
                inputMode="numeric"
                value={draft.installationId}
                autoComplete="off"
                aria-invalid={errors.installation_id ? true : undefined}
                aria-describedby={`project-installation-hint${errors.installation_id ? ' project-installation-error' : ''}`}
                onChange={(event) =>
                  props.onChange({ installationId: event.target.value })
                }
                className={`${INPUT_CLASS} font-data text-xs`}
              />
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}
