/**
 * ProjectSettingsPage: a project's facts, its overrides of company settings, history, archive, delete.
 *
 * Why: how Workers behave on a project (which checks gate a ticket, which harness runs, how
 *   many at once) is data the owner edits here, never a file (d-0085, d-0090). The page keeps
 *   three things honest: what is inherited versus overridden; that a save is a new numbered
 *   version tied to the version the user opened (a newer one blocks the save and offers a
 *   review, never an overwrite); and that unsaved edits survive a stray click (the
 *   unsaved-changes guard). It also covers loading, error, offline and an empty history.
 *
 * Exports: ProjectSettingsPage.
 * Depends on: react, react-router, api/*, domain/settings-draft, routes/project-settings/*,
 *   state/*.
 */

import { useQueryClient } from '@tanstack/react-query';
import { WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { describeError } from '#/api/describe-error.js';
import {
  settingsKey,
  useProjectSettings,
  useSaveSettings,
} from '#/api/use-project-settings.js';
import { useAllProjects } from '#/api/use-projects.js';
import { StatePanel } from '#/components/status/state-panel.js';
import {
  docFromDraft,
  draftFromSnapshot,
  isDirty,
  validateDraft,
} from '#/domain/settings-draft.js';
import { ArchiveSection } from '#/routes/project-settings/archive-section.js';
import { DirectorOverride } from '#/routes/project-settings/director-override.js';
import { DeleteSection } from '#/routes/project-settings/delete-section.js';
import { ConflictBanner } from '#/routes/project-settings/conflict-banner.js';
import { HistoryPanel } from '#/routes/project-settings/history-panel.js';
import { ProjectSection } from '#/routes/project-settings/project-section.js';
import { SaveBar } from '#/routes/project-settings/save-bar.js';
import { SettingsForm } from '#/routes/project-settings/settings-form.js';
import { useNotify } from '#/state/notify/notify-context.js';
import { useOnline } from '#/state/use-online.js';
import { useUnsavedChanges } from '#/state/unsaved-changes.js';
import type { SettingsDraft, SettingsSnapshot } from '#/types/project-settings.types.js';

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
  useUnsavedChanges(dirty);

  function restart(snapshot: SettingsSnapshot): void {
    setOpened(snapshot);
    setDraft(draftFromSnapshot(snapshot));
    setReason('');
    save.reset();
  }

  const stale = latest.version.project !== opened.version.project;
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

  return (
    <div className="grid max-w-4xl gap-6">
      <header className="grid gap-1">
        <p className="font-data text-xs text-muted">{slug}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Project settings</h1>
        <p className="max-w-prose text-sm text-muted">
          Each setting follows the company or Forge default until you override it here.
        </p>
      </header>

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

      {stale ? (
        <ConflictBanner
          opened={opened}
          latest={latest}
          onReload={() => restart(latest)}
        />
      ) : null}

      {project ? <ProjectSection project={project} snapshot={latest} /> : null}

      <section aria-labelledby="overrides-heading" className="grid gap-3">
        <h2 id="overrides-heading" className="text-base font-semibold">
          Settings for this project
        </h2>
        <SettingsForm
          snapshot={opened}
          draft={draft}
          issues={issues}
          onChange={setDraft}
          disabled={save.isPending}
        />
      </section>

      <section aria-labelledby="director-heading" className="grid gap-3">
        <h2 id="director-heading" className="text-base font-semibold">
          Director for this project
        </h2>
        <DirectorOverride
          snapshot={opened}
          draft={draft}
          issues={issues.filter((i) => i.field === 'director').map((i) => i.message)}
          onChange={setDraft}
          disabled={save.isPending}
        />
      </section>

      <HistoryPanel versions={latest.versions} />
      <ArchiveSection
        slug={slug}
        archived={project?.status === 'archived'}
        disabled={!online}
      />
      <DeleteSection slug={slug} localPath={project?.local_path} disabled={!online} />

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
