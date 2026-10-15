/**
 * ProjectForm: register an existing clone as a Forge project: check the folder, review, create.
 *
 * Why: the first project in the wizard and every later project from "Add project" are the
 *   same task, so one component serves both pages. It does the careful order the server
 *   enforces: the folder is checked first with a dry run that creates nothing and says what
 *   Forge found; only then are the name, prefix, branch, git host and checks offered, prefilled
 *   from that; and a folder edited after the check hides them again, so a project is never
 *   created from facts about a different folder. Every refusal from the server is shown beside
 *   the field it belongs to with a fix (Nielsen 9). Enter in the folder box checks it, Enter in
 *   any other box creates. The server's strict body is built in `domain/project-draft`.
 *
 * Exports: ProjectForm.
 * Depends on: react, api/use-onboarding, components/onboarding/*, components/settings/form-field,
 *   components/ui/button, domain/{project-draft,create-project-errors}, state/{use-author-prefs,
 *   use-online}, schemas/projects (type).
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ProjectInspection } from '@forge/core';
import { useCreateProject, useInspectFolder } from '#/api/use-onboarding.js';
import { FolderCheck } from '#/components/onboarding/folder-check.js';
import { ProjectFields } from '#/components/onboarding/project-fields.js';
import { Reveal } from '#/components/motion/reveal.js';
import { Notice } from '#/components/settings/form-field.js';
import { Button } from '#/components/ui/button.js';
import { explainCreateError } from '#/domain/create-project-errors.js';
import {
  buildCreateRequest,
  draftFromInspection,
  EMPTY_DRAFT,
  validateDraft,
} from '#/domain/project-draft.js';
import type { ProjectView } from '#/schemas/projects.js';
import { useAuthorPrefs } from '#/state/use-author-prefs.js';
import { useOnline } from '#/state/use-online.js';
import type {
  FieldProblem,
  ProjectDraft,
  ProjectField,
} from '#/types/onboarding.types.js';

const text = (p: FieldProblem): string => `${p.message} ${p.fix}`;

export function ProjectForm(props: {
  folder: string;
  onFolderChange: (folder: string) => void;
  onCreated: (project: ProjectView) => void;
  /** Extra buttons beside Create (Back, Cancel). */
  secondary?: ReactNode;
}) {
  const { folder } = props;
  const online = useOnline();
  const [author, setAuthor] = useAuthorPrefs();
  const inspect = useInspectFolder();
  const create = useCreateProject();
  const [inspection, setInspection] = useState<{
    folder: string;
    facts: ProjectInspection;
  } | null>(null);

  const [draft, setDraft] = useState<ProjectDraft>(EMPTY_DRAFT);
  const [folderProblem, setFolderProblem] = useState<FieldProblem | null>(null);
  const [errors, setErrors] = useState<Partial<Record<ProjectField, string>>>({});
  const [formProblem, setFormProblem] = useState<FieldProblem | null>(null);
  const facts = inspection?.folder === folder.trim() ? inspection.facts : null;
  const checked = facts !== null;

  const check = async (): Promise<void> => {
    const path = folder.trim();
    if (path === '' || inspect.isPending) {
      return;
    }

    setFolderProblem(null);
    setFormProblem(null);
    try {
      const found = await inspect.mutateAsync({ local_path: path });
      setInspection({ folder: path, facts: found });
      setDraft((previous) => draftFromInspection(found, previous));
      setErrors({});
    } catch (error) {
      setInspection(null);
      setFolderProblem(explainCreateError(error, draft.host));
    }
  };

  const submit = async (): Promise<void> => {
    if (!checked || create.isPending) {
      return;
    }

    const problems = validateDraft(draft, author);
    setErrors(problems);
    setFormProblem(null);
    if (Object.keys(problems).length > 0) {
      return;
    }

    try {
      const made = await create.mutateAsync(buildCreateRequest(folder, draft, author));

      props.onCreated(made.project);
    } catch (error) {
      const problem = explainCreateError(error, draft.host);
      if (problem.field === 'local_path') {
        setFolderProblem(problem);
      } else if (problem.field === 'form') {
        setFormProblem(problem);
      } else {
        setErrors({ [problem.field]: text(problem) });
      }
    }
  };

  const patch = (change: Partial<ProjectDraft>): void => {
    setDraft((previous) => ({ ...previous, ...change }));
    setErrors({});
    setFormProblem(null);
  };

  return (
    <form
      aria-label="New project"
      className="grid gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {online ? null : (
        <Notice tone="warn" title="You are offline">
          Forge cannot check or create anything until the connection is back.
        </Notice>
      )}
      <FolderCheck
        folder={folder}
        onFolderChange={(next) => {
          props.onFolderChange(next);
          setFolderProblem(null);
        }}
        onCheck={() => void check()}
        checking={inspect.isPending}
        inspection={facts}
        problem={folderProblem}
      />
      <Reveal show={checked}>
        {facts ? (
          <div className="grid gap-6">
            <ProjectFields
              inspection={facts}
              draft={draft}
              errors={errors}
              author={author}
              onAuthor={setAuthor}
              onChange={patch}
            />
            {formProblem ? (
              <Notice tone="error" title={formProblem.message}>
                {formProblem.fix}
              </Notice>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                variant="primary"
                disabled={!online}
                status={create.isPending ? 'loading' : 'idle'}
              >
                Create project
              </Button>
              {props.secondary}
            </div>
          </div>
        ) : null}
      </Reveal>
      {checked ? null : props.secondary ? (
        <div className="flex flex-wrap gap-2">{props.secondary}</div>
      ) : null}
    </form>
  );
}
