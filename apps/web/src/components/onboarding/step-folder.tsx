/**
 * StepFolder: the first add-project step, choosing the folder with Browse and seeing what Forge found.
 *
 * Why: a project can be any folder on this machine, so the folder is the one input every later
 *   choice depends on, and typing a path from memory is where people go wrong. There is no text
 *   box: one large Browse area opens the system folder window (Explorer, Finder, zenity); if
 *   that cannot open, Forge's own folder browser opens instead with a note saying why, so
 *   Browse never dead-ends. Once chosen, the path stays as a chip with "Change", and Forge
 *   checks it at once with a dry run that creates nothing, saying in one line what it found or
 *   what to do about a folder it cannot use.
 *
 * Exports: StepFolder.
 * Depends on: lucide-react, react, api/{describe-error,use-onboarding}, components/onboarding/folder-browser,
 *   components/settings/form-field, components/ui/button, types/onboarding.types.
 */

import { Check, FolderOpen, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { describeError } from '#/api/describe-error.js';
import { usePickFolder } from '#/api/use-onboarding.js';
import { FolderBrowser } from '#/components/onboarding/folder-browser.js';
import { Notice } from '#/components/settings/form-field.js';
import { Button } from '#/components/ui/button.js';
import type { ProjectWizard } from '#/types/onboarding.types.js';

function leafName(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);

  return parts[parts.length - 1] ?? path;
}

function Found(props: { wizard: ProjectWizard }) {
  const { inspection } = props.wizard;

  if (!inspection) {
    return null;
  }

  const languages =
    inspection.ecosystems.length > 0 ? inspection.ecosystems.join(', ') : null;

  const checks = inspection.checks.length;

  return (
    <p role="status" className="flex items-start gap-2 text-sm">
      <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-good" />
      <span>
        This folder can be a project.{' '}
        <span className="text-muted">
          {languages ? `Found ${languages}. ` : 'No language recognised. '}
          {checks > 0
            ? `${checks} check${checks === 1 ? '' : 's'} suggested.`
            : 'You can add checks by hand later in this dialog.'}
        </span>
      </span>
    </p>
  );
}

export function StepFolder(props: { wizard: ProjectWizard }) {
  const { wizard } = props;
  const [browsing, setBrowsing] = useState(false);
  const [fallbackNote, setFallbackNote] = useState<string | undefined>(undefined);
  const pick = usePickFolder();
  const chosen = wizard.folder.trim() !== '';
  const ready = wizard.inspection !== null && !wizard.inspecting;

  // Keyboard path: choose, Enter, Enter. Once the folder checks out, Next has the focus.
  useEffect(() => {
    if (ready) {
      document.getElementById('project-next')?.focus();
    }
  }, [ready]);

  const browse = (): void => {
    pick.mutate(wizard.folder.trim(), {
      onSuccess(result) {
        if (result.status === 'picked') {
          void wizard.choose(result.path);
        } else if (result.status === 'unavailable') {
          setFallbackNote(
            `The system folder window is not available here (${result.reason}), so this is Forge's own folder browser.`,
          );

          setBrowsing(true);
        }
      },
      onError(error) {
        setFallbackNote(
          `The system folder window could not open (${describeError(error).title}), so this is Forge's own folder browser.`,
        );

        setBrowsing(true);
      },
    });
  };

  return (
    <div className="grid gap-5">
      {chosen ? (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-signal-soft text-signal">
            <FolderOpen aria-hidden="true" className="size-5" />
          </span>
          <div className="grid min-w-0 flex-1 gap-0.5">
            <p className="truncate text-sm font-semibold">{leafName(wizard.folder)}</p>
            <p
              title={wizard.folder}
              className="truncate font-data text-xs text-muted"
              aria-label={`Chosen folder ${wizard.folder}`}
            >
              {wizard.folder}
            </p>
          </div>
          <Button onClick={browse} status={pick.isPending ? 'loading' : 'idle'}>
            Change
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={browse}
          disabled={pick.isPending}
          className="group grid min-h-56 w-full place-items-center content-center gap-3 rounded-2xl border-2 border-dashed border-line bg-surface p-8 text-center transition-[background-color,border-color,transform] duration-150 hover:border-signal hover:bg-signal-soft focus-visible:border-signal active:translate-y-px disabled:cursor-wait disabled:opacity-70"
        >
          <span className="grid size-14 place-items-center rounded-2xl bg-signal-soft text-signal transition-transform duration-150 group-hover:-translate-y-0.5">
            {pick.isPending ? (
              <LoaderCircle aria-hidden="true" className="size-7 animate-spin" />
            ) : (
              <FolderOpen aria-hidden="true" className="size-7" />
            )}
          </span>
          <span className="grid gap-1">
            <span className="text-base font-semibold">
              {pick.isPending ? 'Waiting for the folder window…' : 'Choose a folder'}
            </span>
            <span className="max-w-sm text-sm text-muted">
              {pick.isPending
                ? 'A folder window opened on your desktop. It may be behind this browser.'
                : 'Any folder works, with or without git. Forge checks it first and changes nothing until you create the project.'}
            </span>
          </span>
        </button>
      )}
      {wizard.inspecting ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Checking this folder…
        </p>
      ) : wizard.folderProblem ? (
        <Notice tone="error" title={wizard.folderProblem.message}>
          {wizard.folderProblem.fix}
        </Notice>
      ) : (
        <Found wizard={wizard} />
      )}
      <FolderBrowser
        open={browsing}
        onOpenChange={setBrowsing}
        start={wizard.folder.trim()}
        note={fallbackNote}
        onSelect={(path) => {
          setBrowsing(false);
          void wizard.choose(path);
        }}
      />
    </div>
  );
}
