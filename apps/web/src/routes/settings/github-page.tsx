/**
 * Forge settings, GitHub: the GitHub Apps Forge reaches repositories through.
 *
 * Why: a project's repository is reached through a connection (an installed GitHub App), and
 *   without one Forge cannot open pull requests or read issues. This screen shows which
 *   connections exist and lets the owner add another for a different account or
 *   organisation, in a modal so a half-typed private key is never lost to a stray click. The server offers list and add only, so there is no edit or disable here;
 *   the one-click App creation flow is a later addition. Private keys are never displayed.
 *
 * Exports: GithubPage.
 * Depends on: react, lucide-react, api/describe-error, api/use-settings-data,
 *   components/settings/*, components/ui/modal (via ConnectionForm), components/status/state-panel,
 *   components/ui/button, domain/format-time.
 */

import { Plug, Plus, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { describeError } from '#/api/describe-error.js';
import { useGithubConnections } from '#/api/use-settings-data.js';
import { ConnectionForm } from '#/components/settings/connection-form.js';
import {
  BoxEmpty,
  SettingsBox,
  SettingsRow,
} from '#/components/settings/settings-box.js';
import { SettingsPage } from '#/components/settings/settings-page.js';
import { StatusPill } from '#/components/settings/status-pill.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { Button } from '#/components/ui/button.js';
import { formatWhen } from '#/domain/format-time.js';

export function GithubPage() {
  const connections = useGithubConnections();
  const [adding, setAdding] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const list = connections.isSuccess ? connections.data : [];

  const openForm = (): void => {
    setAttempt((n) => n + 1);
    setAdding(true);
  };

  const addButton = (
    <Button variant="primary" onClick={openForm}>
      <Plus aria-hidden="true" className="size-4" />
      Add connection
    </Button>
  );

  return (
    <SettingsPage
      title="GitHub"
      icon={Plug}
      intro="The GitHub Apps Forge uses to reach your repositories. An App belongs to one account or organisation, so add one connection for each."
      actions={
        <Button
          onClick={() => void connections.refetch()}
          status={connections.isFetching && !connections.isPending ? 'loading' : 'idle'}
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          Refresh
        </Button>
      }
    >
      <SettingsBox
        title="Connections"
        count={connections.isSuccess ? list.length : undefined}
        action={connections.isSuccess && list.length > 0 ? addButton : undefined}
      >
        {connections.isPending ? (
          <div className="p-4">
            <StatePanel kind="loading" label="Loading connections" />
          </div>
        ) : null}
        {connections.isError ? (
          <div className="p-4">
            <StatePanel
              kind="error"
              title={describeError(connections.error).title}
              detail={describeError(connections.error).detail}
              onRetry={() => void connections.refetch()}
              retrying={connections.isFetching}
            />
          </div>
        ) : null}
        {connections.isSuccess && list.length === 0 ? (
          <BoxEmpty title="No GitHub connection yet">
            <p>Add the App Forge should use for your repositories.</p>
            <div className="mt-3">{addButton}</div>
          </BoxEmpty>
        ) : null}
        {connections.isSuccess && list.length > 0 ? (
          <ul aria-label="GitHub connections" className="divide-y divide-line">
            {list.map((c) => (
              <li key={c.id}>
                <SettingsRow
                  icon={c.account}
                  name={
                    <>
                      <span>{c.account}</span>
                      {c.status === 'active' ? (
                        <StatusPill tone="good">Active</StatusPill>
                      ) : (
                        <StatusPill tone="quiet">Disabled</StatusPill>
                      )}
                    </>
                  }
                  meta={`App ${c.app_id}${c.app_slug ? ` · ${c.app_slug}` : ''} · added ${formatWhen(c.created_at)}`}
                  note="The private key is stored by Forge and cannot be shown."
                />
              </li>
            ))}
          </ul>
        ) : null}
      </SettingsBox>
      <ConnectionForm
        key={attempt}
        open={adding}
        onClose={() => setAdding(false)}
        onDone={() => {
          setAdding(false);
        }}
      />
    </SettingsPage>
  );
}
