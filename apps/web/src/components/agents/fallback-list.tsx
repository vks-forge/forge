/**
 * FallbackList: the ordered "if that cannot run, try this" list of an agent, at most five.
 *
 * Why: when the main harness is out of quota or down, Forge tries the agent's fallbacks in
 *   order, so the order is the policy and must be easy to change and to read. Each row is a
 *   harness and model with move up, move down and remove buttons (buttons, not drag, so the
 *   order is reachable by keyboard and by a screen reader), and the list stops at five with the
 *   limit stated rather than silently ignoring a sixth. Under the list sits the last resort: when every
 *   entry fails the Director may pick a substitute agent of the same role (the default, so the key stays absent
 *   in a stored agent) or the ticket pauses and tells the owner.
 *
 * Exports: FallbackList.
 * Depends on: lucide-react, components/ui/button, components/agents/runs-on-picker,
 *   domain/agent-form (moveItem), schemas/agents.
 */

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { RunsOnPicker } from '#/components/agents/runs-on-picker.js';
import { Button } from '#/components/ui/button.js';
import { moveItem } from '#/domain/agent-form.js';
import { MAX_AGENT_FALLBACKS } from '#/schemas/agents.js';
import type { AgentRole, RunsOn, RunsOnHarness } from '#/schemas/agents.js';

const ICON_BUTTON = 'min-w-9 px-0';

const EXHAUSTED_CHOICES = [
  {
    value: 'director_substitute',
    label: 'Let the Director pick a substitute',
    hint: 'It picks another agent for the same role, from a list Forge has already checked. You can see which one ran.',
  },
  {
    value: 'pause',
    label: 'Pause and tell me',
    hint: 'The ticket waits in your Inbox with everything that was tried.',
  },
] as const;

export function FallbackList(props: {
  fallbacks: RunsOn['fallbacks'];
  role: AgentRole;
  harnesses: readonly RunsOnHarness[];
  disabled: boolean;
  /** Message per fallback index, from the form check. */
  errors: Readonly<Record<number, string | undefined>>;
  listError: string | undefined;
  /** What happens when the whole list fails; absent reads as a Director substitute. */
  onExhausted: RunsOn['on_exhausted'];
  onChange: (next: RunsOn['fallbacks']) => void;
  onExhaustedChange: (next: NonNullable<RunsOn['on_exhausted']>) => void;
}) {
  const { fallbacks } = props;
  const full = fallbacks.length >= MAX_AGENT_FALLBACKS;

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <h3 className="text-sm font-medium">Fallbacks</h3>
        <p className="max-w-prose text-xs text-muted">
          Tried in this order when the harness above is out of quota, rate-limited or its
          model is unavailable. Up to {MAX_AGENT_FALLBACKS}. When the list is empty, the
          company’s fallback harnesses apply.
        </p>
      </div>
      {props.listError ? (
        <p role="alert" className="text-xs text-danger">
          {props.listError}
        </p>
      ) : null}
      {fallbacks.length > 0 ? (
        <ol className="grid gap-3">
          {fallbacks.map((fallback, index) => {
            const n = index + 1;

            return (
              <li
                key={index}
                aria-label={`Fallback ${n}`}
                className="grid gap-3 rounded-xl border border-line p-3"
              >
                <RunsOnPicker
                  prefix={`fallback-${index}`}
                  namePrefix={`Fallback ${n} `}
                  harness={fallback.harness}
                  model={fallback.model}
                  role={props.role}
                  harnesses={props.harnesses}
                  allowForgeDefault={false}
                  disabled={props.disabled}
                  modelError={props.errors[index]}
                  onChange={(next) =>
                    props.onChange(fallbacks.map((f, i) => (i === index ? next : f)))
                  }
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    className={ICON_BUTTON}
                    aria-label={`Move fallback ${n} up`}
                    disabled={props.disabled || index === 0}
                    onClick={() => props.onChange(moveItem(fallbacks, index, -1))}
                  >
                    <ArrowUp aria-hidden="true" className="size-4" />
                  </Button>
                  <Button
                    className={ICON_BUTTON}
                    aria-label={`Move fallback ${n} down`}
                    disabled={props.disabled || index === fallbacks.length - 1}
                    onClick={() => props.onChange(moveItem(fallbacks, index, 1))}
                  >
                    <ArrowDown aria-hidden="true" className="size-4" />
                  </Button>
                  <Button
                    aria-label={`Remove fallback ${n}`}
                    disabled={props.disabled}
                    onClick={() =>
                      props.onChange(fallbacks.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                    Remove
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={props.disabled || full}
          onClick={() =>
            props.onChange([
              ...fallbacks,
              { harness: 'project_default', model: { kind: 'harness_default' } },
            ])
          }
        >
          <Plus aria-hidden="true" className="size-4" />
          Add fallback
        </Button>
        {full ? (
          <p className="text-xs text-muted">
            That is the limit of {MAX_AGENT_FALLBACKS}.
          </p>
        ) : null}
      </div>
      <fieldset className="grid gap-1.5" disabled={props.disabled}>
        <legend className="text-sm font-medium">When every fallback fails</legend>
        {EXHAUSTED_CHOICES.map((choice) => (
          <label key={choice.value} className="flex min-h-9 items-start gap-2 text-sm">
            <input
              type="radio"
              name="on-exhausted"
              className="mt-1"
              checked={(props.onExhausted ?? 'director_substitute') === choice.value}
              onChange={() => props.onExhaustedChange(choice.value)}
            />
            <span className="grid">
              {choice.label}
              <span className="text-xs text-muted">{choice.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
