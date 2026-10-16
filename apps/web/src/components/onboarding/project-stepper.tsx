/**
 * ProjectStepper: the numbered progress header of the add-project steps.
 *
 * Why: a five-step form is only calm when the person always knows where they are, how far
 *   there is to go and that they can go back. Steps are numbered circles on a line that fills
 *   as they pass; finished steps show a check and can be clicked to go back (Nielsen 1, 3),
 *   the current one is marked with `aria-current` as well as colour, and later steps are not
 *   reachable by clicking, because they depend on the answers before them. On a narrow screen
 *   only the current label stays, so the row never wraps.
 *
 * Exports: ProjectStepper.
 * Depends on: lucide-react, domain/new-project-steps, types/onboarding.types.
 */

import { Check } from 'lucide-react';
import { PROJECT_STEPS, projectStepIndex } from '#/domain/new-project-steps.js';
import type { ProjectStepId } from '#/types/onboarding.types.js';

export function ProjectStepper(props: {
  step: ProjectStepId;
  onGo: (step: ProjectStepId) => void;
  /** Going back is blocked while a request is in flight. */
  locked: boolean;
}) {
  const current = projectStepIndex(props.step);

  return (
    <nav aria-label="Add project steps">
      <ol className="flex items-center">
        {PROJECT_STEPS.map((s, index) => {
          const done = index < current;
          const active = index === current;

          return (
            <li key={s.id} className="flex min-w-0 flex-1 items-center last:flex-none">
              <button
                type="button"
                disabled={!done || props.locked}
                aria-current={active ? 'step' : undefined}
                onClick={() => props.onGo(s.id)}
                className="group flex min-w-0 items-center gap-2 rounded-lg py-1 pr-2 text-sm disabled:cursor-default"
              >
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-full border font-data text-xs transition-[background-color,border-color,color] duration-150 ${
                    active
                      ? 'border-signal bg-signal text-on-signal'
                      : done
                        ? 'border-signal bg-signal-soft text-signal group-hover:bg-hover'
                        : 'border-line bg-surface text-muted'
                  }`}
                >
                  {done ? <Check aria-hidden="true" className="size-3.5" /> : index + 1}
                </span>
                <span
                  className={`truncate ${active ? 'font-medium' : 'hidden text-muted sm:inline'}`}
                >
                  {s.label}
                  <span className="sr-only">{done ? ' (done)' : ''}</span>
                </span>
              </button>
              {index < PROJECT_STEPS.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={`mx-1 h-px min-w-3 flex-1 transition-colors duration-300 ${
                    done ? 'bg-signal' : 'bg-line'
                  }`}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
