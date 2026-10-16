/**
 * `useProjectWizard()`: the state and rules of the add-project steps, shared by the dialog and
 * the first-run wizard.
 *
 * Why: adding a project is a careful order the server enforces: check the folder first (a dry
 * run that creates nothing), then offer the git, name and check choices prefilled from what was
 * found, then create. Holding that order in one place means both hosts behave the same: a folder
 * changed after the check drops the old facts, Next is disabled by the current step's own
 * problems only, a name or prefix another project uses is caught while typing, and a refusal
 * from the server sends the person to the step that shows the field with the fix beside it
 * (Nielsen 5, 9). Errors appear only for fields the person has touched, so a prefilled
 * form never opens covered in red.
 *
 * Exports: useProjectWizard().
 * Depends on: react, @forge/core (ProjectInspection, type), api/use-onboarding, api/use-projects,
 *   domain/{project-draft,new-project-steps,create-project-errors}, state/{use-author-prefs,use-online},
 *   schemas/projects (type), types/onboarding.types.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectInspection } from '@forge/core';
import { useCreateProject, useInspectFolder } from '#/api/use-onboarding.js';
import { useProjects } from '#/api/use-projects.js';
import { explainCreateError } from '#/domain/create-project-errors.js';
import {
  adjacentStep,
  problemsForStep,
  PROJECT_STEPS,
  stepOfField,
} from '#/domain/new-project-steps.js';
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
  ProjectProblems,
  ProjectStepId,
  ProjectWizard,
} from '#/types/onboarding.types.js';

const DRAFT_FIELD: Readonly<Partial<Record<keyof ProjectDraft, ProjectField>>> = {
  slug: 'slug',
  prefix: 'prefix',
  baseBranch: 'base_branch',
  connectionId: 'connection',
  repo: 'repo',
  installationId: 'installation_id',
  checks: 'checks',
};

export function useProjectWizard(options: {
  onCreated: (project: ProjectView) => void;
  /** The folder is kept by the host (first-run keeps it across steps); omit to keep it here. */
  folder?: string;
  onFolderChange?: (folder: string) => void;
}): ProjectWizard {
  const online = useOnline();
  const [author, setAuthor] = useAuthorPrefs();
  const inspect = useInspectFolder();
  const create = useCreateProject();
  const projects = useProjects();
  const [ownFolder, setOwnFolder] = useState('');
  const folder = options.folder ?? ownFolder;
  const [inspection, setInspection] = useState<{
    folder: string;
    facts: ProjectInspection;
  } | null>(null);

  const [draft, setDraft] = useState<ProjectDraft>(EMPTY_DRAFT);
  const [step, setStep] = useState<ProjectStepId>('folder');
  const [touched, setTouched] = useState<ReadonlySet<ProjectField>>(new Set());
  const [refused, setRefused] = useState<ProjectProblems>({});
  const [folderProblem, setFolderProblem] = useState<FieldProblem | null>(null);
  const [formProblem, setFormProblem] = useState<FieldProblem | null>(null);
  const [created, setCreated] = useState(false);
  const latest = useRef('');
  const facts = inspection?.folder === folder.trim() ? inspection.facts : null;

  const taken = useMemo(
    () => ({
      slugs: new Set((projects.data ?? []).map((p) => p.slug)),
      prefixes: new Set((projects.data ?? []).map((p) => p.prefix)),
    }),
    [projects.data],
  );

  const problems = validateDraft(draft, author, taken);
  const ownProblems = problemsForStep(step, problems);
  const canAdvance =
    step === 'folder' ? facts !== null : Object.keys(ownProblems).length === 0;

  const shown: ProjectProblems = { ...refused };

  for (const field of touched) {
    const message = problems[field];

    if (message !== undefined) {
      shown[field] = message;
    }
  }

  const touch = (...fields: ProjectField[]): void => {
    setTouched((previous) => new Set([...previous, ...fields]));
    setRefused({});
    setFormProblem(null);
  };

  const setFolder = (next: string): void => {
    setOwnFolder(next);
    options.onFolderChange?.(next);
  };

  const choose = async (picked: string): Promise<void> => {
    const path = picked.trim();

    if (path === '') {
      return;
    }

    latest.current = path;
    setFolder(path);
    setFolderProblem(null);
    setFormProblem(null);
    try {
      const found = await inspect.mutateAsync({ local_path: path });

      if (latest.current !== path) {
        return;
      }

      setInspection({ folder: path, facts: found });
      setDraft((previous) => draftFromInspection(found, previous));
      setTouched(new Set());
      setRefused({});
    } catch (error) {
      if (latest.current === path) {
        setInspection(null);
        setFolderProblem(explainCreateError(error, draft.host));
      }
    }
  };

  // The first-run wizard keeps the folder across steps but not the check: check it again on return.
  const resumed = useRef(false);

  useEffect(() => {
    if (!resumed.current && folder.trim() !== '') {
      resumed.current = true;
      void choose(folder);
    }
    // Once, on mount: later folder changes come from `choose` itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const failCreate = (error: unknown): void => {
    const problem = explainCreateError(error, draft.host);

    if (problem.field === 'local_path') {
      setFolderProblem(problem);
      setStep('folder');
    } else if (problem.field === 'form' && problems.form === undefined) {
      setFormProblem(problem);
    } else {
      setRefused({ [problem.field]: `${problem.message} ${problem.fix}` });
      setStep(stepOfField(problem.field));
    }
  };

  const submit = async (): Promise<void> => {
    if (create.isPending || !online) {
      return;
    }

    if (step !== 'review') {
      if (canAdvance) {
        setStep(adjacentStep(step, 1));
      } else {
        // Enter on an invalid step: show every problem the step owns.
        touch(...(Object.keys(ownProblems) as ProjectField[]));
      }

      return;
    }

    const blocked = PROJECT_STEPS.find(
      (s) => s.id !== 'review' && Object.keys(problemsForStep(s.id, problems)).length > 0,
    );

    if (!facts || blocked) {
      setStep(blocked?.id ?? 'folder');
      touch(...(Object.keys(problems) as ProjectField[]));

      return;
    }

    setFormProblem(null);
    try {
      const made = await create.mutateAsync(
        buildCreateRequest(folder, draft, author, facts),
      );

      setCreated(true);
      options.onCreated(made.project);
    } catch (error) {
      failCreate(error);
    }
  };

  return {
    folder,
    inspection: facts,
    inspecting: inspect.isPending,
    folderProblem,
    draft,
    step,
    shown,
    canAdvance,
    formProblem,
    creating: create.isPending,
    author,
    online,
    dirty: folder.trim() !== '' && !created,
    choose,
    patch(change) {
      setDraft((previous) => ({ ...previous, ...change }));
      touch(
        ...(Object.keys(change)
          .map((key) => DRAFT_FIELD[key as keyof ProjectDraft])
          .filter((f): f is ProjectField => f !== undefined) as ProjectField[]),
      );
    },
    setAuthor(name) {
      setAuthor(name);
      touch('form');
    },
    submit,
    back() {
      setStep((current) => adjacentStep(current, -1));
    },
    goTo: setStep,
  };
}
