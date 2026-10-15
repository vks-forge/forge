/**
 * WelcomePage: the first-run wizard at `/welcome`, full screen, outside the app shell.
 *
 * Why: a fresh Forge has no project, so the shell (project switcher, project nav) has nothing
 *   to show. The wizard walks through the four things that make Forge useful (where it keeps
 *   its files, a working harness, optionally GitHub, and a first project) in that order. It
 *   opens at the first step the server says is not done, keeps the step and the typed folder
 *   across route changes, goes back with Esc, and can be left at any time with "Finish later",
 *   which lands in Forge settings (everything here is also there) and stops `/` from sending
 *   the user back. Creating the project ends the wizard on that project's Home.
 *
 * Exports: WelcomePage.
 * Depends on: react, react-router, api/use-onboarding, api/describe-error, components/onboarding/*,
 *   components/status/state-panel, components/ui/button, domain/{wizard-steps,nav-entries},
 *   state/use-welcome-prefs.
 */

import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router';
import { describeError } from '#/api/describe-error.js';
import { useSystem } from '#/api/use-onboarding.js';
import { DataFolderStep } from '#/components/onboarding/data-folder-step.js';
import { GitHubStep } from '#/components/onboarding/github-step.js';
import { HarnessStep } from '#/components/onboarding/harness-step.js';
import { ProjectForm } from '#/components/onboarding/project-form.js';
import { WizardFrame } from '#/components/onboarding/wizard-frame.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { Button } from '#/components/ui/button.js';
import { projectPath } from '#/domain/nav-entries.js';
import { neighbour, startStep } from '#/domain/wizard-steps.js';
import { useWelcomePrefs } from '#/state/use-welcome-prefs.js';
import type { WizardStepId } from '#/types/onboarding.types.js';

const COPY: Readonly<Record<WizardStepId, { title: string; intro: string }>> = {
  data: {
    title: 'Where Forge keeps its files',
    intro: 'Forge stores everything it needs in one folder. Nothing is written yet.',
  },
  harness: {
    title: 'Harnesses and logins',
    intro:
      'Workers run the Claude Code you already have installed. Say how it signs in and check that it works.',
  },
  github: {
    title: 'Connect GitHub',
    intro:
      'Optional. A GitHub connection lets Forge open pull requests and read issues. Local git works without it.',
  },
  project: {
    title: 'Your first project',
    intro:
      'Point Forge at a repository on this machine. It checks the folder first and creates nothing until you say so.',
  },
};

export function WelcomePage() {
  const navigate = useNavigate();
  const system = useSystem();
  const prefs = useWelcomePrefs();

  if (system.isPending) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <StatePanel kind="loading" label="Reading Forge" />
      </div>
    );
  }

  if (system.isError) {
    const { title, detail } = describeError(system.error);

    return (
      <div className="mx-auto max-w-3xl p-6">
        <StatePanel
          kind="error"
          title={title}
          detail={detail}
          onRetry={() => void system.refetch()}
          retrying={system.isFetching}
        />
      </div>
    );
  }

  const step = startStep(system.data, prefs.step);
  const { title, intro } = COPY[step];
  const back = neighbour(step, -1);
  const next = neighbour(step, 1);
  const finishLater = (): void => {
    prefs.dismiss();
    void navigate('/settings/harnesses');
  };

  return (
    <div
      onKeyDown={(event) => {
        // Esc goes back one step, unless a control inside already used it (a menu, a dialog).
        if (event.key === 'Escape' && !event.defaultPrevented && back !== step) {
          prefs.setStep(back);
        }
      }}
    >
      <WizardFrame
        step={step}
        onStep={prefs.setStep}
        onFinishLater={finishLater}
        title={title}
        intro={intro}
      >
        {step === 'data' ? <DataFolderStep system={system.data} /> : null}
        {step === 'harness' ? <HarnessStep /> : null}
        {step === 'github' ? <GitHubStep onSkip={() => prefs.setStep(next)} /> : null}
        {step === 'project' ? (
          <ProjectForm
            folder={prefs.folder}
            onFolderChange={prefs.setFolder}
            onCreated={(project) => {
              prefs.setFolder('');
              void navigate(projectPath(project.slug));
            }}
            secondary={
              <Button onClick={() => prefs.setStep(back)}>
                <ChevronLeft aria-hidden="true" className="size-4" />
                Back
              </Button>
            }
          />
        ) : (
          <div className="flex flex-wrap gap-2 border-t border-line pt-5">
            {back !== step ? (
              <Button onClick={() => prefs.setStep(back)}>
                <ChevronLeft aria-hidden="true" className="size-4" />
                Back
              </Button>
            ) : null}
            <Button
              variant="primary"
              onClick={() => prefs.setStep(next)}
              autoFocus={step !== 'harness'}
            >
              Continue
            </Button>
          </div>
        )}
      </WizardFrame>
    </div>
  );
}
