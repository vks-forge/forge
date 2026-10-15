/**
 * NewProjectPage: "Add project" at `/projects/new`, inside the app shell.
 *
 * Why: after setup, more repositories join the same Forge. This is the first-run wizard's
 *   last step as an ordinary page: the same form and the same checks, with the sidebar still
 *   there so the user keeps their bearings. Cancel (or Esc) returns to where they came from
 *   and warns first when a folder has been typed, since the form holds work. Creating the
 *   project switches to its Home, but only after the page has told the shell it no longer
 *   holds unsaved work; navigating in the same instant would be stopped by the shell's own
 *   "discard changes?" guard on a form that was just saved.
 *
 * Exports: NewProjectPage.
 * Depends on: react, react-router, components/onboarding/project-form, components/ui/button,
 *   domain/nav-entries, state/unsaved-changes.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ProjectForm } from '#/components/onboarding/project-form.js';
import { Button } from '#/components/ui/button.js';
import { projectPath } from '#/domain/nav-entries.js';
import { useUnsavedChanges, useUnsavedChangesState } from '#/state/unsaved-changes.js';

export function NewProjectPage() {
  const navigate = useNavigate();
  const [folder, setFolder] = useState('');
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const { dirty } = useUnsavedChangesState();
  useUnsavedChanges(folder.trim() !== '' && createdSlug === null);

  useEffect(() => {
    document.title = 'Add project · Forge';
  }, []);

  useEffect(() => {
    if (createdSlug !== null && !dirty) {
      void navigate(projectPath(createdSlug));
    }
  }, [createdSlug, dirty, navigate]);

  return (
    <section
      className="grid max-w-3xl gap-6 pb-16"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          void navigate(-1);
        }
      }}
    >
      <header className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Add project</h1>
        <p className="max-w-prose text-muted">
          Point Forge at a repository on this machine. It checks the folder first and
          creates nothing until you press Create.
        </p>
      </header>
      <ProjectForm
        folder={folder}
        onFolderChange={setFolder}
        onCreated={(project) => setCreatedSlug(project.slug)}
        secondary={<Button onClick={() => void navigate(-1)}>Cancel</Button>}
      />
    </section>
  );
}
