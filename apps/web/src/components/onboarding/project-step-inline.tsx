/**
 * ProjectStepInline: the first-run wizard's last step, the add-project steps shown inline.
 *
 * Why: the first project is the same task as every later one, so it uses the same steps and
 *   the same rules as the add-project dialog, only drawn in the wizard's page instead of a
 *   dialog: a stepper, the step, and Back / Next beneath it. Back on its first step returns to
 *   the wizard's previous step, so the person is never stranded. The chosen folder is held by
 *   the wizard so it survives a trip to another step and back.
 *
 * Exports: ProjectStepInline.
 * Depends on: components/onboarding/{project-stepper,project-wizard-view}, state/use-project-wizard,
 *   schemas/projects (type).
 */

import { ProjectStepper } from '#/components/onboarding/project-stepper.js';
import {
  ProjectWizardBody,
  ProjectWizardNav,
} from '#/components/onboarding/project-wizard-view.js';
import type { ProjectView } from '#/schemas/projects.js';
import { useProjectWizard } from '#/state/use-project-wizard.js';

export function ProjectStepInline(props: {
  folder: string;
  onFolderChange: (folder: string) => void;
  onCreated: (project: ProjectView) => void;
  onLeave: () => void;
}) {
  const wizard = useProjectWizard({
    folder: props.folder,
    onFolderChange: props.onFolderChange,
    onCreated: props.onCreated,
  });

  return (
    <div className="grid gap-6">
      <ProjectStepper step={wizard.step} onGo={wizard.goTo} locked={wizard.creating} />
      <ProjectWizardBody wizard={wizard} />
      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-5">
        <ProjectWizardNav wizard={wizard} onLeave={props.onLeave} />
      </div>
    </div>
  );
}
