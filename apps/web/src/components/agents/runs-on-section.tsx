/**
 * RunsOnSection: which harness and model an agent runs on, and what it falls back to.
 *
 * Why: this is the choice with money and uptime attached. The section reads every configured
 *   harness from `GET /agents/runs-on`, says plainly which ones cannot run work today and links
 *   to the page that fixes each, and never hides them. It also covers its own loading, empty
 *   and failed states, because a picker with nothing in it looks like a broken form: while the
 *   list loads the controls are disabled, with no harness it points to the Harnesses page, and
 *   if the read fails it says so with a retry (the rest of the form still saves).
 *
 * Exports: RunsOnSection.
 * Depends on: react-router, lucide-react, api/use-agents, components/agents/*,
 *   components/settings/{settings-card,form-field}, components/ui/{button,empty-state},
 *   domain/agent-form, domain/agent-models, types/agent-ui.types.
 */

import { Cpu } from 'lucide-react';
import { Link } from 'react-router';
import { useRunsOn } from '#/api/use-agents.js';
import { FallbackList } from '#/components/agents/fallback-list.js';
import { RunsOnPicker } from '#/components/agents/runs-on-picker.js';
import { Notice } from '#/components/settings/form-field.js';
import { SettingsCard } from '#/components/settings/settings-card.js';
import { Button } from '#/components/ui/button.js';
import { EmptyState } from '#/components/ui/empty-state.js';
import { describeError } from '#/api/describe-error.js';
import { issueAt } from '#/domain/agent-form.js';
import { notReadyHarnesses } from '#/domain/agent-models.js';
import type { AgentRole, RunsOn } from '#/schemas/agents.js';
import type { FormIssue } from '#/types/agent-ui.types.js';

export function RunsOnSection(props: {
  runsOn: RunsOn;
  role: AgentRole;
  issues: readonly FormIssue[];
  disabled: boolean;
  /** Only the built-in implementer may follow the Forge lane model. */
  isImplementer: boolean;
  /** Shown on a project screen over a company agent. */
  note?: string;
  onChange: (next: RunsOn) => void;
}) {
  const harnesses = useRunsOn();
  const { runsOn } = props;
  const fallbackErrors = Object.fromEntries(
    runsOn.fallbacks.map((_, i) => [i, issueAt(props.issues, `runs_on.fallbacks.${i}`)]),
  );

  let body;
  if (harnesses.isPending) {
    body = (
      <p role="status" className="text-sm text-muted">
        Loading harnesses and their models…
      </p>
    );
  } else if (harnesses.isError) {
    const { title, detail } = describeError(harnesses.error);
    body = (
      <Notice tone="error" title={`Could not read the harnesses: ${title}`}>
        <p>{detail}</p>
        <Button
          className="mt-2"
          onClick={() => void harnesses.refetch()}
          status={harnesses.isFetching ? 'loading' : 'idle'}
        >
          Try again
        </Button>
      </Notice>
    );
  } else if (harnesses.data.length === 0) {
    body = (
      <EmptyState
        variant="compact"
        icon={Cpu}
        title="No harness is set up"
        actions={
          <Link to="/settings/harnesses" className="text-sm text-signal underline">
            Set up a harness
          </Link>
        }
      >
        An agent needs a harness to run on.
      </EmptyState>
    );
  } else {
    const blocked = notReadyHarnesses(harnesses.data);
    body = (
      <div className="grid gap-5">
        <RunsOnPicker
          prefix="runs-on"
          harness={runsOn.harness}
          model={runsOn.model}
          role={props.role}
          harnesses={harnesses.data}
          allowForgeDefault={props.isImplementer}
          disabled={props.disabled}
          modelError={issueAt(props.issues, 'runs_on.model')}
          onChange={(next) => props.onChange({ ...runsOn, ...next })}
        />
        {blocked.length > 0 ? (
          <ul className="grid gap-2" aria-label="Harnesses that cannot run work">
            {blocked.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-attn bg-attn-soft px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium">{h.id}</span> cannot run work right now.{' '}
                  {h.reasons.join(' ')}
                </span>
                <Link
                  to={h.fix_href}
                  aria-label={`Fix in settings: ${h.id}`}
                  className="text-signal underline"
                >
                  Fix in settings
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <FallbackList
          fallbacks={runsOn.fallbacks}
          role={props.role}
          harnesses={harnesses.data}
          disabled={props.disabled}
          errors={fallbackErrors}
          listError={props.issues.find((i) => i.path === 'runs_on.fallbacks')?.message}
          onExhausted={runsOn.on_exhausted}
          onChange={(fallbacks) => props.onChange({ ...runsOn, fallbacks })}
          onExhaustedChange={(choice) => {
            // Choosing the default removes the key, so an agent that never chose keeps its hash.
            const next: RunsOn = { ...runsOn };

            if (choice === 'pause') {
              next.on_exhausted = 'pause';
            } else {
              delete next.on_exhausted;
            }

            props.onChange(next);
          }}
        />
      </div>
    );
  }

  return (
    <SettingsCard
      id="runs-on"
      title="Runs on"
      description="The harness and model this agent uses, and what it tries when that one cannot run."
    >
      {props.note ? <p className="text-sm text-muted">{props.note}</p> : null}
      {body}
    </SettingsCard>
  );
}
