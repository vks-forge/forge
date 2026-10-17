/**
 * ProjectSettingsPage: the editor frame of a project's settings: draft, banners, save bar and the tabs' outlet.
 *
 * Why: how Workers behave on a project (which checks gate a ticket, which harness runs, how
 *   many at once) is data the owner edits here, never a file (d-0085, d-0090). The page keeps
 *   three things honest: what is inherited versus overridden; that a save is a new numbered
 *   version tied to the version the user opened (a newer one blocks the save and offers a
 *   review, never an overwrite); and that unsaved edits survive a stray click (the
 *   unsaved-changes guard) and a tab switch. The draft lives here, above the tabs (one URL per
 *   section, see project-settings-routes), so every tab edits the same draft and one save bar
 *   saves them all. It also covers loading, error, offline and an empty history.
 *
 * Exports: ProjectSettingsPage.
 * Depends on: react, react-router, api/*, domain/settings-draft, routes/project-settings/*,
 *   components/settings/settings-layout, state/*.
 */

import { useQueryClient } from '@tanstack/react-query';
import { WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Outlet, useLocation, useParams } from 'react-router';
import { describeError } from '#/api/describe-error.js';
import {
  settingsKey,
  useProjectSettings,
  useSaveSettings,
} from '#/api/use-project-settings.js';
import { useAllProjects } from '#/api/use-projects.js';
import { SettingsLayout } from '#/components/settings/settings-layout.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { projectPath } from '#/domain/nav-entries.js';
import {
  dirtyFields,
  docFromDraft,
  draftFromSnapshot,
  isDirty,
  SCOPE_FIELDS,
  validateDraft,
} from '#/domain/settings-draft.js';
import { ConflictBanner } from '#/routes/project-settings/conflict-banner.js';
import { PROJECT_SETTINGS_SECTIONS } from '#/routes/project-settings/project-settings-routes.js';
import { SaveBar } from '#/routes/project-settings/save-bar.js';
import { useNotify } from '#/state/notify/notify-context.js';
import { useOnline } from '#/state/use-online.js';
import { useUnsavedChanges } from '#/state/unsaved-changes.js';
import type { SettingsDraft, SettingsSnapshot } from '#/types/project-settings.types.js';
import type {
  ProjectSettingsContext,
  SettingsTab,
} from '#/types/settings-layout.types.js';

function Editor(props: { slug: string; latest: SettingsSnapshot }) {
  const { slug, latest } = props;
  const online = useOnline();
  const queryClient = useQueryClient();
  const projects = useAllProjects();
  const save = useSaveSettings(slug);
  const notify = useNotify();
  // `opened` is the version the user started from; `latest` may move on under them.
  const [opened, setOpened] = useState<SettingsSnapshot>(latest);
  const [draft, setDraft] = useState<SettingsDraft>(() => draftFromSnapshot(latest));
  const [reason, setReason] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Project settings · Forge';
  }, []);

  const dirty = isDirty(opened, draft);
  // Tabs are URLs under the settings path: moving between them keeps the draft, leaving asks.
  const base = projectPath(slug, 'settings');
  useUnsavedChanges(dirty, base);

  function restart(snapshot: SettingsSnapshot): void {
    setOpened(snapshot);
    setDraft(draftFromSnapshot(snapshot));
    setReason('');
    save.reset();
  }

  const stale = latest.version.project !== opened.version.project;
  // Agents and pipelines save through their own editors (own versions, reason and conflict banner), so
  // this tab shows neither the shared save bar nor a conflict about fields it does not hold.
  const here = useLocation().pathname;
  const onAgents = here === `${base}/agents` || here === `${base}/pipelines`;

  // An agent save moves the project's version. With nothing edited here there is nothing to
  // conflict with, so follow the latest instead of showing a banner about no change. (Adjusted
  // while rendering, not in an effect: it only re-renders this component, once.)
  if (stale && !dirty && !save.isPending) {
    setOpened(latest);
    setDraft(draftFromSnapshot(latest));
  }

  const issues = validateDraft(draft, opened);
  const project = projects.data?.find((p) => p.slug === slug);
  const holdReason = !online
    ? 'You are offline. Saving is paused.'
    : stale
      ? 'A newer version exists. Review it above first.'
      : issues.length > 0
        ? 'Fix the highlighted fields to save.'
        : reason.trim() === ''
          ? 'Say why you are changing this; it goes in the history.'
          : null;

  const onSave = (): void => {
    setSaved(null);
    save.mutate(
      {
        doc: docFromDraft(opened.override, draft),
        reason: reason.trim(),
        expectedVersion: opened.version.project,
      },
      {
        onSuccess: (version) => {
          const fresh = queryClient.getQueryData<SettingsSnapshot>(settingsKey(slug));
          if (fresh) {
            restart(fresh);
          }

          setSaved(
            `Saved as version ${version.version}. Workers use it from the next tick.`,
          );

          notify.success('Project settings saved', {
            description: `Version ${version.version}. Workers use it from the next tick.`,
          });
        },
      },
    );
  };

  // A tab whose fields differ from the saved version carries a small "unsaved" dot.
  const changed: ReadonlySet<string> = dirty ? dirtyFields(opened, draft) : new Set();
  const tabs: readonly SettingsTab[] = PROJECT_SETTINGS_SECTIONS.map((section) => {
    const fields: readonly string[] =
      section.segment in SCOPE_FIELDS
        ? SCOPE_FIELDS[section.segment as keyof typeof SCOPE_FIELDS]
        : [];

    return {
      to: `${base}/${section.segment}`,
      label: section.label,
      icon: section.icon,
      dirty: fields.some((field) => changed.has(field)),
    };
  });

  const shared: ProjectSettingsContext = {
    slug,
    project,
    latest,
    opened,
    draft,
    issues,
    onChange: setDraft,
    saving: save.isPending,
    online,
  };

  return (
    <div className="grid max-w-5xl gap-6">
      <header className="grid gap-1">
        <p className="font-data text-xs text-muted">{slug}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Project settings</h1>
        <p className="max-w-prose text-sm text-muted">
          Each setting follows the company or Forge default until you override it here.
        </p>
      </header>

      <SettingsLayout label="Project settings sections" tabs={tabs}>
        <div className="grid gap-6">
          {!online ? (
            <p
              role="status"
              className="flex items-center gap-2 rounded-lg bg-hover px-3 py-2 text-sm"
            >
              <WifiOff aria-hidden="true" className="size-4 shrink-0" />
              You are offline. You can read and edit, but saving is paused.
            </p>
          ) : null}

          {latest.warnings.length > 0 ? (
            <ul
              role="status"
              className="grid gap-1 rounded-lg bg-attn-soft px-3 py-2 text-sm"
            >
              {latest.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          {stale && !onAgents ? (
            <ConflictBanner
              opened={opened}
              latest={latest}
              onReload={() => restart(latest)}
            />
          ) : null}

          <Outlet context={shared} />

          {onAgents ? null : (
            <SaveBar
              version={opened.version.project}
              latest={opened.versions.at(-1)}
              dirty={dirty}
              reason={reason}
              onReason={setReason}
              holdReason={holdReason}
              saving={save.isPending}
              saveError={save.isError ? describeError(save.error).detail : null}
              saved={dirty ? null : saved}
              onSave={onSave}
              onDiscard={() => restart(opened)}
            />
          )}
        </div>
      </SettingsLayout>
    </div>
  );
}

export function ProjectSettingsPage() {
  const { slug = '' } = useParams();
  const settings = useProjectSettings(slug);

  if (settings.isPending) {
    return <StatePanel kind="loading" label="Loading project settings" />;
  }

  if (settings.isError) {
    const { title, detail } = describeError(settings.error);

    return (
      <StatePanel
        kind="error"
        title={title}
        detail={detail}
        onRetry={() => void settings.refetch()}
        retrying={settings.isFetching}
      />
    );
  }

  // Keyed by project so switching project starts a clean draft, never carries edits across.
  return <Editor key={slug} slug={slug} latest={settings.data} />;
}
