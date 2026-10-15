/**
 * WizardFrame: the full-screen frame of the first-run wizard: progress, title, "Finish later".
 *
 * Why: first run is the one time a person sees Forge with nothing in it, so it needs a calm
 *   frame that says where they are (step 2 of 4), what each step is called, how to go back to
 *   an earlier one, and, always visible, how to leave and come back later without losing
 *   anything. No sidebar: there is no project yet to show. Steps are plain buttons in an
 *   ordered list so the keyboard can reach any of them, and the current one is marked with
 *   `aria-current` as well as colour.
 *
 * Exports: WizardFrame.
 * Depends on: react, components/ui/button, domain/wizard-steps, types/onboarding.types.
 */

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Button } from '#/components/ui/button.js';
import { stepIndex, WIZARD_STEPS } from '#/domain/wizard-steps.js';
import type { WizardStepId } from '#/types/onboarding.types.js';

export function WizardFrame(props: {
  step: WizardStepId;
  onStep: (step: WizardStepId) => void;
  onFinishLater: () => void;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  const current = stepIndex(props.step);
  const { title } = props;

  useEffect(() => {
    document.title = `${title} · Set up Forge`;
  }, [title]);

  return (
    <div className="mx-auto grid min-h-dvh w-full max-w-3xl content-start gap-8 px-4 py-6 md:px-8 md:py-10">
      <header className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold tracking-tight">Forge</span>
        <Button onClick={props.onFinishLater}>Finish later</Button>
      </header>
      <nav aria-label="Setup steps">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {WIZARD_STEPS.map((s, index) => (
            <li key={s.id}>
              <button
                type="button"
                aria-current={index === current ? 'step' : undefined}
                onClick={() => props.onStep(s.id)}
                className={`grid min-h-12 w-full content-center gap-0.5 rounded-lg border px-3 py-2 text-left text-sm transition-[background-color,border-color,transform] duration-150 active:translate-y-px ${
                  index === current
                    ? 'border-signal bg-signal-soft font-medium'
                    : 'border-line bg-surface text-muted hover:bg-hover'
                }`}
              >
                <span className="font-data text-[0.68rem]">
                  {index < current ? 'Done' : `Step ${index + 1}`}
                </span>
                <span className="truncate">{s.label}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <main id="main" tabIndex={-1} className="grid gap-6 outline-none">
        <div className="grid gap-2">
          <p className="text-xs text-muted">
            Step {current + 1} of {WIZARD_STEPS.length}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{props.title}</h1>
          <p className="max-w-prose text-muted">{props.intro}</p>
        </div>
        {props.children}
      </main>
    </div>
  );
}
