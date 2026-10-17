/**
 * TemplateGallery: pick a ready-made agent to start from.
 *
 * Why: most agents an owner wants (a security reviewer, a docs writer, an accessibility
 *   reviewer) have a well-known shape, and writing 40 lines of instructions from nothing is the
 *   step that makes people give up. The gallery lists the templates the server ships, each with
 *   what it is for, and picking one opens the editor prefilled; nothing is saved until the owner
 *   presses Create agent, so trying a template costs nothing. It covers its own loading, empty
 *   and failed states.
 *
 * Exports: TemplateGallery.
 * Depends on: lucide-react, api/describe-error, api/use-agents, components/ui/{modal,button,empty-state},
 *   domain/agent-copy, schemas/agents.
 */

import { LayoutTemplate } from 'lucide-react';
import { describeError } from '#/api/describe-error.js';
import { useAgentTemplates } from '#/api/use-agents.js';
import { Button } from '#/components/ui/button.js';
import { EmptyState } from '#/components/ui/empty-state.js';
import { Modal } from '#/components/ui/modal.js';
import { ROLE_INFO } from '#/domain/agent-copy.js';
import type { AgentTemplate } from '#/schemas/agents.js';

export function TemplateGallery(props: {
  onClose: () => void;
  onPick: (template: AgentTemplate) => void;
}) {
  const templates = useAgentTemplates(true);

  let body;
  if (templates.isPending) {
    body = (
      <p role="status" className="text-sm text-muted">
        Loading templates…
      </p>
    );
  } else if (templates.isError) {
    body = (
      <div role="alert" className="grid justify-items-start gap-2 text-sm">
        <p className="font-medium">Could not load the templates</p>
        <p className="text-muted">{describeError(templates.error).detail}</p>
        <Button
          onClick={() => void templates.refetch()}
          status={templates.isFetching ? 'loading' : 'idle'}
        >
          Try again
        </Button>
      </div>
    );
  } else if (templates.data.length === 0) {
    body = (
      <EmptyState variant="compact" icon={LayoutTemplate} title="No templates installed">
        Make an agent from scratch, or describe it to the Director.
      </EmptyState>
    );
  } else {
    body = (
      <ul aria-label="Templates" className="grid gap-3 sm:grid-cols-2">
        {templates.data.map((template) => (
          <li
            key={template.id}
            className="grid content-between gap-3 rounded-xl border border-line p-4"
          >
            <div className="grid gap-1.5">
              <h3 className="text-sm font-semibold">{template.title}</h3>
              <p className="text-xs text-muted">
                {ROLE_INFO[template.definition.role].label}
              </p>
              <p className="text-sm text-muted">{template.summary}</p>
            </div>
            <div>
              <Button
                aria-label={`Use template ${template.title}`}
                onClick={() => props.onPick(template)}
              >
                Use template
              </Button>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Modal
      open
      size="large"
      onClose={props.onClose}
      title="Start from a template"
      description="A template fills the form for you. Nothing is saved until you press Create agent."
      primary={null}
    >
      {body}
    </Modal>
  );
}
