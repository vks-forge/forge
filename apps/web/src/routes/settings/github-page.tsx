/**
 * Forge settings, GitHub: the GitHub Apps Forge reaches repositories through.
 *
 * Why: a project's repository is reached through a connection (an installed GitHub App), and
 *   without one Forge cannot open pull requests or read issues. This screen shows which
 *   connections exist and lets the owner add another for a different account or
 *   organisation. The server offers list and add only, so there is no edit or disable here;
 *   the one-click App creation flow is a later addition. Private keys are never displayed.
 *
 * Exports: GithubPage.
 * Depends on: react, lucide-react, api/describe-error, api/use-settings-data,
 *   components/motion/reveal, components/settings/*, components/status/state-panel,
 *   components/ui/button, domain/format-time.
 */

import { Plus, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { describeError } from '#/api/describe-error.js';
import { useGithubConnections } from '#/api/use-settings-data.js';
import { Reveal } from '#/components/motion/reveal.js';
import { ConnectionForm } from '#/components/settings/connection-form.js';
import { Notice } from '#/components/settings/form-field.js';
import { SettingsPage, SettingsSection } from '#/components/settings/settings-page.js';
import { StatusPill } from '#/components/settings/status-pill.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { Button } from '#/components/ui/button.js';
import { formatWhen } from '#/domain/format-time.js';

export function GithubPage() {
  const connections = useGithubConnections();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  return (
    <SettingsPage
      title="GitHub"
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
      <SettingsSection
        id="connections"
        title="Connections"
        description="Each one is an installed GitHub App."
      >
        {connections.isPending ? (
          <StatePanel kind="loading" label="Loading connections" />
        ) : null}
        {connections.isError ? (
          <StatePanel
            kind="error"
            title={describeError(connections.error).title}
            detail={describeError(connections.error).detail}
            onRetry={() => void connections.refetch()}
            retrying={connections.isFetching}
          />
        ) : null}
        {connections.isSuccess && connections.data.length === 0 ? (
          <StatePanel kind="empty" title="No GitHub connection yet">
            Add the App Forge should use for your repositories.
          </StatePanel>
        ) : null}
        {connections.isSuccess && connections.data.length > 0 ? (
          <ul aria-label="GitHub connections" className="grid gap-3">
            {connections.data.map((c) => (
              <li
                key={c.id}
                className="grid gap-1 rounded-xl border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold">{c.account}</span>
                  {c.status === 'active' ? (
                    <StatusPill tone="good">Active</StatusPill>
                  ) : (
                    <StatusPill tone="quiet">Disabled</StatusPill>
                  )}
                </div>
                <p className="font-data text-xs text-muted">
                  App {c.app_id}
                  {c.app_slug ? ` · ${c.app_slug}` : ''} · added{' '}
                  {formatWhen(c.created_at)}
                </p>
                <p className="text-xs text-faint">
                  The private key is stored by Forge and cannot be shown.
                </p>
              </li>
            ))}
          </ul>
        ) : null}
        <Reveal show={added && !adding}>
          <Notice tone="good" title="Connection added">
            Projects can now use this account's repositories.
          </Notice>
        </Reveal>
        {adding ? (
          <ConnectionForm
            onCancel={() => setAdding(false)}
            onDone={() => {
              setAdding(false);
              setAdded(true);
            }}
          />
        ) : (
          <div>
            <Button
              variant="primary"
              onClick={() => {
                setAdded(false);
                setAdding(true);
              }}
            >
              <Plus aria-hidden="true" className="size-4" />
              Add connection
            </Button>
          </div>
        )}
      </SettingsSection>
    </SettingsPage>
  );
}
