/**
 * NewProjectPage: "Add project" at `/projects/new`, a large step-by-step dialog over the app shell.
 *
 * Why: adding a project is a short guided task (choose a folder, see what git says, name it,
 *   review the checks, create), not a place to live, so it is a dialog, not a page. The route
 *   stays so the project switcher, the empty-state link and a pasted address all open it.
 *   Closing (Cancel, the close button or Esc) returns to where the person came from, or to the
 *   start when the address was opened directly, and asks "Discard?" first once a folder has
 *   been chosen, because the choices are work; clicking the dimmed page behind never closes it.
 *   Creating the project says so with a notification and opens the project's Home.
 *
 * Exports: NewProjectPage.
 * Depends on: react, react-router, components/onboarding/{project-stepper,project-wizard-view},
 *   components/ui/modal, domain/nav-entries, state/{notify/notify-context,use-project-wizard}.
 */

import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ProjectStepper } from '#/components/onboarding/project-stepper.js';
import {
  ProjectWizardBody,
  ProjectWizardNav,
} from '#/components/onboarding/project-wizard-view.js';
import { Modal } from '#/components/ui/modal.js';
import { projectPath } from '#/domain/nav-entries.js';
import { useNotify } from '#/state/notify/notify-context.js';
import { useProjectWizard } from '#/state/use-project-wizard.js';

export function NewProjectPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const notify = useNotify();

  const wizard = useProjectWizard({
    onCreated(project) {
      notify.success(`Project ${project.slug} created`, {
        description: 'It is ready for its first ticket.',
        action: {
          label: 'View',
          onClick: () => void navigate(projectPath(project.slug)),
        },
      });

      void navigate(projectPath(project.slug), { replace: true });
    },
  });

  useEffect(() => {
    document.title = 'Add project · Forge';
  }, []);

  const close = (): void => {
    // `default` is the first entry of the session: nothing to go back to.
    if (location.key === 'default') {
      void navigate('/');
    } else {
      void navigate(-1);
    }
  };

  return (
    <Modal
      open
      size="large"
      title="Add project"
      description="Choose a folder and Forge sets the rest up with you. Nothing is created until the last step."
      onClose={close}
      dirty={wizard.dirty}
      busy={wizard.creating}
      discardTitle="Discard this new project?"
      discardDescription="The folder you chose and what you entered will be lost. Nothing has been created."
      subheader={
        <ProjectStepper step={wizard.step} onGo={wizard.goTo} locked={wizard.creating} />
      }
      primary={<ProjectWizardNav wizard={wizard} />}
    >
      <ProjectWizardBody wizard={wizard} />
    </Modal>
  );
}
