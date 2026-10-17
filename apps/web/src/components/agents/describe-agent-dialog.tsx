/**
 * DescribeAgentDialog: say what an agent is for and let the Director draft it.
 *
 * Why: people can usually say what they want ("review migrations for data loss") faster than they
 *   can write the instructions, tools and limits that make it so. The Director turns the
 *   description into a complete draft, which takes a model call of up to two minutes, so the
 *   dialog shows that it is working and lets the owner cancel at any point without losing what
 *   they typed. The draft is never saved here: it opens in the editor with the Director's
 *   reasoning and open questions, and only Create agent stores it. When the Director's draft
 *   breaks a role bound (a reviewer given an edit tool) the rule it broke is listed, because the
 *   owner can fix that by describing the agent differently.
 *
 * Exports: DescribeAgentDialog.
 * Depends on: react, lucide-react, api/use-agents, components/ui/{modal,button},
 *   components/settings/form-field, domain/agent-copy, domain/agent-form, schemas/agents,
 *   types/agent-ui.types.
 */

import { LoaderCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { useDraftAgent } from '#/api/use-agents.js';
import { FormField, INPUT_CLASS } from '#/components/settings/form-field.js';
import { Button } from '#/components/ui/button.js';
import { Modal } from '#/components/ui/modal.js';
import { agentErrorText, errorIssues } from '#/domain/agent-copy.js';
import { formFromFields } from '#/domain/agent-form.js';
import type { DraftAgentOutput } from '#/schemas/agents.js';
import type { AgentScope, AgentSeed, DraftNote } from '#/types/agent-ui.types.js';

const MIN = 10;
const MAX = 2000;

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function DescribeAgentDialog(props: {
  scope: AgentScope;
  onClose: () => void;
  onDrafted: (seed: AgentSeed, note: DraftNote) => void;
}) {
  const [text, setText] = useState('');
  const draft = useDraftAgent();
  const controller = useRef<AbortController | null>(null);
  const cancelled = useRef(false);
  const length = text.trim().length;
  const valid = length >= MIN && length <= MAX;

  function start(): void {
    cancelled.current = false;
    controller.current = new AbortController();
    draft.mutate(
      {
        body: { description: text.trim(), scope: props.scope },
        signal: controller.current.signal,
      },
      {
        onSuccess: (out: DraftAgentOutput) => {
          if (!cancelled.current) {
            props.onDrafted(
              { form: formFromFields(out.definition), origin: 'director_draft' },
              { rationale: out.rationale, questions: out.questions },
            );
          }
        },
      },
    );
  }

  function stop(): void {
    cancelled.current = true;
    controller.current?.abort();
    draft.reset();
  }

  const failure = draft.isError && !isAbort(draft.error) ? draft.error : null;
  const words = failure ? agentErrorText(failure) : null;

  return (
    <Modal
      open
      onClose={() => {
        stop();
        props.onClose();
      }}
      title="Describe it to the Director"
      description="Say what the agent is for. The Director drafts it; nothing is saved until you press Create agent."
      primary={
        <Button variant="primary" disabled={!valid || draft.isPending} onClick={start}>
          Draft with the Director
        </Button>
      }
    >
      <div className="grid gap-4">
        <FormField
          id="describe-text"
          label="What should the agent do?"
          hint={`${length.toLocaleString('en-US')} of ${MAX.toLocaleString('en-US')} characters, at least ${MIN}. For example: review database migrations for data loss and missing rollbacks.`}
        >
          <textarea
            id="describe-text"
            rows={6}
            value={text}
            disabled={draft.isPending}
            aria-describedby="describe-text-hint"
            onChange={(e) => setText(e.target.value)}
            className={`${INPUT_CLASS} py-2`}
          />
        </FormField>
        {draft.isPending ? (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-hover px-3 py-2 text-sm"
          >
            <span className="flex items-center gap-2">
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              Director is drafting… this can take up to two minutes.
            </span>
            <Button onClick={stop}>Cancel drafting</Button>
          </div>
        ) : null}
        {words ? (
          <div
            role="alert"
            className="grid gap-1 rounded-lg border border-danger bg-danger-soft p-3 text-sm"
          >
            <p className="font-medium text-danger">{words.title}</p>
            <p>{words.detail}</p>
            {errorIssues(failure).length > 0 ? (
              <ul className="list-disc pl-5 text-xs">
                {errorIssues(failure).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
