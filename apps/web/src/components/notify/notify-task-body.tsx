/**
 * NotifyTaskBody: the live part of a task notification, a progress bar and a step list.
 *
 * Why: a job that runs for a while (the compatibility checks) needs to say how far it has
 *   got without taking over the screen. A determinate bar says "3 of 7"; when the total is
 *   unknown a sliding stripe says "still working" (a still stripe under reduced motion). The
 *   step list shows only the current step and a count until the user opens it, and is
 *   capped in height with a thin scrollbar so a long list never pushes the stack off screen,
 *   and labels wrap so the full text is readable. The
 *   whole block opts out of the live region while running, so a screen reader hears the
 *   start and the end of the job and any failed step, not every percent tick.
 *
 * Exports: NotifyTaskBody, progressText().
 * Depends on: react, motion/react, lucide-react, types/notify.types, theme/motion.
 */

import { Check, ChevronDown, Circle, LoaderCircle, Minus, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useId, useState } from 'react';
import { springs } from '#/theme/motion.js';
import type {
  NotifyProgress,
  NotifyStep,
  NotifyStepStatus,
} from '#/types/notify.types.js';

const STATUS_WORD: Readonly<Record<NotifyStepStatus, string>> = {
  pending: 'Waiting',
  running: 'Running',
  pass: 'Passed',
  fail: 'Failed',
  skip: 'Skipped',
};

function clampedFraction(progress: NotifyProgress): number | null {
  if (progress.value === undefined) {
    return null;
  }

  const max = progress.max !== undefined && progress.max > 0 ? progress.max : 100;

  return Math.min(1, Math.max(0, progress.value / max));
}

/** "3 of 7" when the total is known, a percentage when it is the default 100, or the caller's label. */
export function progressText(progress: NotifyProgress): string {
  if (progress.label !== undefined) {
    return progress.label;
  }

  if (progress.value === undefined) {
    return '';
  }

  if (progress.max !== undefined && progress.max > 0 && progress.max !== 100) {
    return `${progress.value} of ${progress.max}`;
  }

  return `${Math.round((clampedFraction(progress) ?? 0) * 100)}%`;
}

function StepIcon(props: { status: NotifyStepStatus }) {
  const common = 'size-3.5 shrink-0';

  switch (props.status) {
    case 'running':
      return (
        <LoaderCircle
          aria-hidden="true"
          className={`${common} animate-spin text-signal motion-reduce:animate-none`}
        />
      );
    case 'pass':
      return <Check aria-hidden="true" className={`${common} text-good`} />;
    case 'fail':
      return <X aria-hidden="true" className={`${common} text-danger`} />;
    case 'skip':
      return <Minus aria-hidden="true" className={`${common} text-faint`} />;
    default:
      return <Circle aria-hidden="true" className={`${common} text-faint`} />;
  }
}

function currentStep(steps: readonly NotifyStep[]): NotifyStep | undefined {
  return (
    steps.find((step) => step.status === 'running') ??
    steps.find((step) => step.status === 'pending') ??
    steps[steps.length - 1]
  );
}

function ProgressBar(props: { title: string; progress: NotifyProgress }) {
  const reduced = useReducedMotion();
  const fraction = clampedFraction(props.progress);
  const max =
    props.progress.max !== undefined && props.progress.max > 0 ? props.progress.max : 100;

  const text = progressText(props.progress);

  return (
    <div className="grid gap-1">
      <div
        role="progressbar"
        aria-label={`${props.title} progress`}
        aria-valuemin={0}
        {...(fraction === null
          ? {}
          : {
              'aria-valuenow': props.progress.value,
              'aria-valuemax': max,
              ...(text ? { 'aria-valuetext': text } : {}),
            })}
        className="relative h-1.5 overflow-hidden rounded-full bg-line"
      >
        {fraction === null ? (
          <motion.div
            className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-signal"
            {...(reduced
              ? {}
              : {
                  initial: { x: '-100%' },
                  animate: { x: '250%' },
                  transition: { duration: 1.4, repeat: Infinity, ease: 'easeInOut' },
                })}
          />
        ) : (
          <motion.div
            className="absolute inset-0 origin-left rounded-full bg-signal"
            initial={false}
            animate={{ scaleX: fraction }}
            transition={springs.smooth}
          />
        )}
      </div>
      {text ? <p className="font-data text-xs text-muted">{text}</p> : null}
    </div>
  );
}

function StepList(props: { steps: readonly NotifyStep[] }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const current = currentStep(props.steps);
  const done = props.steps.filter(
    (step) => step.status !== 'pending' && step.status !== 'running',
  );

  const failed = props.steps.filter((step) => step.status === 'fail');

  return (
    <div className="grid min-w-0 gap-1.5">
      <div className="flex items-center gap-2 text-xs text-muted">
        {!open && current ? (
          <>
            <StepIcon status={current.status} />
            <span className="min-w-0 flex-1 truncate">{current.label}</span>
          </>
        ) : (
          <span className="flex-1" />
        )}
        <span className="shrink-0 whitespace-nowrap tabular-nums">
          {done.length} of {props.steps.length} steps
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex min-h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-xs font-medium text-fg hover:bg-hover"
        >
          {open ? 'Hide steps' : 'Show steps'}
          <ChevronDown
            aria-hidden="true"
            className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </div>
      {open ? (
        <ul
          id={listId}
          className="scroll-thin grid max-h-40 grid-cols-[minmax(0,1fr)] gap-1.5 overflow-x-hidden overflow-y-auto rounded-lg bg-hover/40 p-2"
        >
          {props.steps.map((step, index) => (
            <li
              key={`${index}-${step.label}`}
              className="flex min-w-0 items-start gap-2 text-xs"
            >
              <span className="mt-0.5 shrink-0">
                <StepIcon status={step.status} />
              </span>
              <span
                className={`min-w-0 flex-1 break-words ${
                  step.status === 'fail' ? 'text-danger' : 'text-fg'
                }`}
              >
                {step.label}
              </span>
              <span className="sr-only">{STATUS_WORD[step.status]}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {failed.map((step) => (
        <span key={step.label} className="sr-only" aria-live="polite">
          Step failed: {step.label}
        </span>
      ))}
    </div>
  );
}

/**
 * `live` is true while the task runs: progress and steps are then excluded from
 * announcements, except failed steps, which carry their own sr-only line.
 */
export function NotifyTaskBody(props: {
  title: string;
  progress: NotifyProgress | undefined;
  steps: readonly NotifyStep[] | undefined;
  live: boolean;
}) {
  const steps = props.steps && props.steps.length > 0 ? props.steps : undefined;

  if (!props.progress && !steps) {
    return null;
  }

  return (
    <div
      className="grid min-w-0 gap-2"
      {...(props.live ? { 'aria-live': 'off' as const } : {})}
    >
      {props.live && props.progress ? (
        <ProgressBar title={props.title} progress={props.progress} />
      ) : null}
      {steps ? <StepList steps={steps} /> : null}
    </div>
  );
}
