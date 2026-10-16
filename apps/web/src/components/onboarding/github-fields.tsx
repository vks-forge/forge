/**
 * GitHubFields: the connection and installation id that let Forge open pull requests.
 *
 * Why: when the folder's remote is a GitHub repository the person may want verified work to
 *   go through pull requests instead of merging locally. That needs one of their GitHub
 *   connections (a GitHub App) and the installation id; the repository itself is read from the
 *   remote, never typed. With no active connection the box explains what is missing and links
 *   to where to add one, instead of showing an empty list.
 *
 * Exports: GitHubFields.
 * Depends on: react-router, api/use-settings-data, components/ui/{field,picker}, types/onboarding.types.
 */

import { Link } from 'react-router';
import { useGithubConnections } from '#/api/use-settings-data.js';
import { Field, INPUT_CLASS } from '#/components/ui/field.js';
import { Picker } from '#/components/ui/picker.js';
import type { ProjectDraft, ProjectField } from '#/types/onboarding.types.js';

export function GitHubFields(props: {
  draft: ProjectDraft;
  errors: Partial<Record<ProjectField, string>>;
  onChange: (patch: Partial<ProjectDraft>) => void;
}) {
  const { draft, errors } = props;
  const connections = useGithubConnections();
  const active = (connections.data ?? []).filter((c) => c.status === 'active');

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {connections.isSuccess && active.length === 0 ? (
        <p className="text-sm text-muted sm:col-span-2">
          There is no active GitHub connection yet.{' '}
          <Link className="font-medium text-signal underline" to="/settings/github">
            Add one in Forge settings
          </Link>
          , or merge locally instead.
        </p>
      ) : (
        <Field
          id="project-connection"
          label="GitHub connection"
          error={errors.connection}
        >
          <Picker
            id="project-connection"
            items={active.map((c) => ({ value: c.id, label: c.account }))}
            value={draft.connectionId}
            placeholder="Choose a connection"
            loading={connections.isPending}
            error={errors.connection ? true : undefined}
            aria-describedby={errors.connection ? 'project-connection-error' : undefined}
            onChange={(connectionId) => props.onChange({ connectionId })}
          />
        </Field>
      )}
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
          onChange={(event) => props.onChange({ installationId: event.target.value })}
          className={`${INPUT_CLASS} font-data text-xs`}
        />
      </Field>
      {errors.repo ? (
        <p role="alert" className="text-xs text-danger sm:col-span-2">
          {errors.repo}
        </p>
      ) : null}
    </div>
  );
}
