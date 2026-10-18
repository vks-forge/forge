/**
 * TestAgentPanel: send the agent as it is on screen one short message and read the answer.
 *
 * Why: instructions and a model choice are guesses until something answers. One tool-less model
 *   call, bounded by a 60 second timeout, shows the owner what the agent says about its role
 *   and which model really replied, before any ticket is spent on it. Because it costs money it
 *   only ever runs when the owner clicks, and the card says before the click exactly what is
 *   asked and that a model call is spent.
 *   It tests what is on screen, saved or not, and a failure is explained in plain words with
 *   what to try (signed out, out of quota, a harness that cannot run), never as a raw code.
 *
 * Exports: TestAgentPanel.
 * Depends on: react-router, api/use-agents, components/settings/{settings-card,form-field},
 *   components/ui/button, domain/agent-copy, domain/agent-form, types/agent-ui.types.
 */

import { Link } from 'react-router';
import { useTestAgent } from '#/api/use-agents.js';
import { Notice } from '#/components/settings/form-field.js';
import { SettingsCard } from '#/components/settings/settings-card.js';
import { Button } from '#/components/ui/button.js';
import { agentErrorText, errorIssues, testFailureWords } from '#/domain/agent-copy.js';
import { checkForm } from '#/domain/agent-form.js';
import type { AgentForm, AgentScope } from '#/types/agent-ui.types.js';

/** Keep identical to the server's TEST_PROMPT (apps/server/src/services/agent-test.ts). */
const TEST_QUESTION =
  'In one line, state your role and the first rule in your instructions.';

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

export function TestAgentPanel(props: { form: AgentForm; scope: AgentScope }) {
  const test = useTestAgent();
  const checked = checkForm(props.form);
  const harness =
    props.form.runs_on.harness === 'project_default'
      ? 'the project’s default harness'
      : props.form.runs_on.harness;

  const run = (): void => {
    if (checked.value) {
      test.mutate({
        agent: checked.value,
        ...(props.scope.kind === 'project' ? { project: props.scope.slug } : {}),
      });
    }
  };

  const result = test.data;
  const refusal = test.isError ? agentErrorText(test.error) : null;

  return (
    <SettingsCard
      id="test"
      title="Test agent"
      description={`Sends the agent, as it is on screen, one question — "${TEST_QUESTION}" — and shows its answer.`}
    >
      <div className="grid gap-3">
        <p className="text-sm text-muted">
          Spends one model call on {harness}, with no tools; nothing is saved. It runs
          only when you press the button.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={run}
            disabled={checked.value === undefined}
            status={test.isPending ? 'loading' : 'idle'}
          >
            Test agent
          </Button>
          {checked.value === undefined ? (
            <span className="text-xs text-muted">
              Fix the fields above first; the test needs a complete agent.
            </span>
          ) : null}
        </div>
        {test.isPending ? (
          <p role="status" className="text-sm text-muted">
            Waiting for one short answer (it gives up after a minute)…
          </p>
        ) : null}
        {result?.ok ? (
          <Notice tone="good" title="The agent answered">
            <blockquote className="whitespace-pre-wrap border-l-2 border-line pl-3 text-fg">
              {result.reply}
            </blockquote>
            <p className="mt-1 font-data text-xs">
              {result.model_used ? `model ${result.model_used} · ` : ''}
              {result.harness_id} · {seconds(result.duration_ms)}
              {result.cost_usd === undefined ? '' : ` · $${result.cost_usd.toFixed(4)}`}
            </p>
          </Notice>
        ) : null}
        {result && !result.ok ? (
          <Notice tone="error" title={testFailureWords(result.error?.family ?? '').what}>
            <p>{testFailureWords(result.error?.family ?? '').fix}</p>
            {result.error?.message ? (
              <p className="mt-1 font-data text-xs">{result.error.message}</p>
            ) : null}
          </Notice>
        ) : null}
        {refusal ? (
          <Notice tone="error" title={refusal.title}>
            <p>{refusal.detail}</p>
            {errorIssues(test.error).length > 0 ? (
              <ul className="mt-1 list-disc pl-5">
                {errorIssues(test.error).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            <Link
              to="/settings/harnesses"
              className="mt-1 inline-block text-signal underline"
            >
              Open harness settings
            </Link>
          </Notice>
        ) : null}
      </div>
    </SettingsCard>
  );
}
