/**
 * ProjectWizardBody and ProjectWizardNav: the step content and the Back / Next buttons of add project.
 *
 * Why: the add-project dialog and the first-run wizard's last step are the same task, so both
 *   render these two pieces around one `useProjectWizard()`. The body is a real form: Enter
 *   in any box means Next (Create on the last step), so the keyboard path is choose, Enter,
 *   Enter. Next is disabled until the step's own problems are gone and the step says why,
 *   never silently. The buttons sit outside the body (in the dialog's footer) and are tied to
 *   the form by its id. A step change fades in, and focus lands on the step's heading so a
 *   keyboard or screen-reader user starts reading at the top of the new step.
 *
 * Exports: ProjectWizardBody, ProjectWizardNav, PROJECT_FORM_ID.
 * Depends on: lucide-react, motion/react, react, components/onboarding/step-*, components/settings/form-field,
 *   components/ui/button, domain/new-project-steps, theme/motion, types/onboarding.types.
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { StepChecks } from '#/components/onboarding/step-checks.js';
import { StepDetails } from '#/components/onboarding/step-details.js';
import { StepFolder } from '#/components/onboarding/step-folder.js';
import { StepGit } from '#/components/onboarding/step-git.js';
import { StepReview } from '#/components/onboarding/step-review.js';
import { Notice } from '#/components/settings/form-field.js';
import { Button } from '#/components/ui/button.js';
import { PROJECT_STEPS, projectStepIndex } from '#/domain/new-project-steps.js';
import { springs } from '#/theme/motion.js';
import type { ProjectStepId, ProjectWizard } from '#/types/onboarding.types.js';

export const PROJECT_FORM_ID = 'new-project-form';

const COPY: Readonly<Record<ProjectStepId, { title: string; intro: string }>> = {
  folder: {
    title: 'Choose a folder',
    intro: 'Pick the folder Forge will work in. It can be any folder on this computer.',
  },
  git: {
    title: 'Git setup',
    intro: 'What Forge found, and how it will use git for this folder.',
  },
  details: {
    title: 'Name the project',
    intro: 'Forge suggested these from the folder. Change what you like.',
  },
  checks: {
    title: 'Checks',
    intro: 'What Forge runs to prove a ticket works before it merges.',
  },
  review: {
    title: 'Review and create',
    intro: 'Check the plan. Nothing is created until you press Create project.',
  },
};

export function ProjectWizardBody(props: { wizard: ProjectWizard }) {
  const { wizard } = props;
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  const { title, intro } = COPY[wizard.step];

  useEffect(() => {
    // Not on open: the dialog's own focus handling owns the first step.
    if (first.current) {
      first.current = false;

      return;
    }

    heading.current?.focus({ preventScroll: true });
  }, [wizard.step]);

  return (
    <form
      id={PROJECT_FORM_ID}
      aria-label="New project"
      noValidate
      className="grid gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void wizard.submit();
      }}
    >
      {wizard.online ? null : (
        <Notice tone="warn" title="You are offline">
          Forge cannot check or create anything until the connection is back.
        </Notice>
      )}
      <motion.div
        key={wizard.step}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0, transition: springs.smooth }}
        className="grid gap-6"
      >
        <div className="grid gap-1">
          <h2
            ref={heading}
            tabIndex={-1}
            className="text-lg font-semibold tracking-tight outline-none"
          >
            {title}
          </h2>
          <p className="text-sm text-muted">{intro}</p>
        </div>
        {wizard.step === 'folder' ? <StepFolder wizard={wizard} /> : null}
        {wizard.step === 'git' ? <StepGit wizard={wizard} /> : null}
        {wizard.step === 'details' ? <StepDetails wizard={wizard} /> : null}
        {wizard.step === 'checks' ? <StepChecks wizard={wizard} /> : null}
        {wizard.step === 'review' ? (
          <StepReview wizard={wizard} onEdit={wizard.goTo} />
        ) : null}
      </motion.div>
    </form>
  );
}

export function ProjectWizardNav(props: {
  wizard: ProjectWizard;
  /** Back on the first step (the first-run wizard leaves to its previous step); omit to hide it there. */
  onLeave?: () => void;
}) {
  const { wizard } = props;
  const index = projectStepIndex(wizard.step);
  const last = index === PROJECT_STEPS.length - 1;
  const canBack = index > 0 || props.onLeave !== undefined;

  return (
    <>
      {canBack ? (
        <Button
          disabled={wizard.creating}
          onClick={() => (index > 0 ? wizard.back() : props.onLeave?.())}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          Back
        </Button>
      ) : null}
      <Button
        id="project-next"
        type="submit"
        form={PROJECT_FORM_ID}
        variant="primary"
        disabled={!wizard.online || !wizard.canAdvance || wizard.inspecting}
        status={wizard.creating ? 'loading' : 'idle'}
      >
        {last ? 'Create project' : 'Next'}
        {last ? null : <ChevronRight aria-hidden="true" className="size-4" />}
      </Button>
    </>
  );
}
