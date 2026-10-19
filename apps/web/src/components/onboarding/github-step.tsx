/**
 * GitHubStep: step 2, optionally connect a GitHub App, or carry on with local git only.
 *
 * Why: GitHub is how Forge opens pull requests and reads issues, but a person can use Forge
 *   on a local clone with no account at all, and a first run that insists on a GitHub App
 *   (an App id and a private key) would lose them. So the step shows what is connected,
 *   offers the same add form as Forge settings, and says plainly that skipping is fine and
 *   reversible: the project step then uses local git. The private key is handled by the shared
 *   form, which empties it the moment it is saved.
 *
 * Exports: GitHubStep.
 * Depends on: react, api/describe-error, api/use-settings-data, components/settings/*,
 *   components/status/state-panel, components/ui/button.
 */

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { describeError } from '#/api/describe-error.js';
import { useGithubConnections } from '#/api/use-settings-data.js';
import { ConnectionForm } from '#/components/settings/connection-form.js';
import { Notice } from '#/components/settings/form-field.js';
import { StatusPill } from '#/components/settings/status-pill.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { Button } from '#/components/ui/button.js';

export function GitHubStep(props: { onSkip: () => void }) {
  const connections = useGithubConnections();
  const [adding, setAdding] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [added, setAdded] = useState(false);

  if (connections.isPending) {
    return <StatePanel kind="loading" label="Loading connections" />;
  }

  if (connections.isError) {
    const { title, detail } = describeError(connections.error);

    return (
      <StatePanel
        kind="error"
        title={title}
        detail={detail}
        onRetry={() => void connections.refetch()}
        retrying={connections.isFetching}
      />
    );
  }

  return (
    <div className="grid gap-5">
      {connections.data.length > 0 ? (
        <ul aria-label="GitHub connections" className="grid gap-2">
          {connections.data.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3"
            >
              <span className="font-semibold">{c.account}</span>
              <span className="font-data text-xs text-muted">App {c.app_id}</span>
              {c.status === 'active' ? (
                <StatusPill tone="good">Active</StatusPill>
              ) : (
                <StatusPill tone="quiet">Disabled</StatusPill>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          No GitHub connection yet. Nothing here is required to use Forge on a local
          repository.
        </p>
      )}
      {added && !adding ? (
        <Notice tone="good" title="Connection added">
          The project step can now use this account's repositories.
        </Notice>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={connections.data.length === 0 ? 'primary' : 'quiet'}
          onClick={() => {
            setAdded(false);
            setAttempt((n) => n + 1);
            setAdding(true);
          }}
        >
          <Plus aria-hidden="true" className="size-4" />
          Add a GitHub connection
        </Button>
        {connections.data.length === 0 ? (
          <Button onClick={props.onSkip}>Skip: use local git only</Button>
        ) : null}
      </div>
      <ConnectionForm
        key={attempt}
        open={adding}
        onClose={() => setAdding(false)}
        onDone={() => {
          setAdding(false);
          setAdded(true);
        }}
      />
      <p className="max-w-prose text-sm text-muted">
        You can add or change connections any time under Forge settings, GitHub.
      </p>
    </div>
  );
}
