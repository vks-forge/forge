/**
 * AgentsWorkspace: the agents screen of one scope: the roster, the editor and the three ways to start an agent.
 *
 * Why: Forge settings (company agents) and a project's settings (its own agents and its
 *   overrides) show the same thing over different data, so one workspace serves both and the two
 *   pages stay thin. It owns which view is open (roster or editor), carries a seed from a
 *   template or the Director's draft into the editor, and gives every state its own face:
 *   loading while the list is read, an error with a retry when the server cannot be reached, an
 *   empty roster that offers the three ways to start, and the roster itself. Nothing the Director
 *   or a template proposes is saved from here; only the editor's save writes.
 *
 * Exports: AgentsWorkspace.
 * Depends on: react, lucide-react, api/use-agents, components/agents/*, components/settings/detail-header,
 *   components/status/state-panel, domain/agent-form, types/agent-ui.types.
 */

import { Bot } from 'lucide-react';
import { useEffect, useState } from 'react';
import { describeError } from '#/api/describe-error.js';
import { useAgents } from '#/api/use-agents.js';
import { AgentEditor } from '#/components/agents/agent-editor.js';
import { AgentList } from '#/components/agents/agent-list.js';
import { DescribeAgentDialog } from '#/components/agents/describe-agent-dialog.js';
import { NewAgentMenu } from '#/components/agents/new-agent-menu.js';
import { TemplateGallery } from '#/components/agents/template-gallery.js';
import { DetailHeader } from '#/components/settings/detail-header.js';
import { Button } from '#/components/ui/button.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { emptyForm, formFromFields } from '#/domain/agent-form.js';
import type {
  AgentScope,
  AgentSeed,
  DraftNote,
  WorkspaceView,
} from '#/types/agent-ui.types.js';

const INTRO =
  'An agent says who does a piece of work and on what: its instructions, harness, model, tools and limits.';

export function AgentsWorkspace(props: { scope: AgentScope }) {
  const { scope } = props;
  const list = useAgents(scope);
  const [view, setView] = useState<WorkspaceView>({ kind: 'list' });
  // Bumped on every new seed so the editor remounts with it, never inherits the last form.
  const [nonce, setNonce] = useState(0);
  const [dialog, setDialog] = useState<'template' | 'describe' | null>(null);
  const project = scope.kind === 'project';

  useEffect(() => {
    if (!project) {
      document.title = 'Agents · Forge settings · Forge';
    }
  }, [project]);

  const openNew = (seed: AgentSeed, note?: DraftNote): void => {
    setDialog(null);
    setNonce((n) => n + 1);
    setView({ kind: 'new', seed, ...(note ? { note } : {}) });
  };

  const menu = (
    <NewAgentMenu
      label={project ? 'New project agent' : 'New agent'}
      onScratch={() => openNew({ form: emptyForm(), origin: 'custom' })}
      onTemplate={() => setDialog('template')}
      onDescribe={() => setDialog('describe')}
    />
  );

  const inList = view.kind === 'list';
  const actions =
    inList && list.data !== undefined && list.data.agents.length > 0 ? menu : undefined;

  let body;
  // A failed background refetch keeps the data: an open editor must never be swept away by it.
  if (list.data === undefined && list.isPending) {
    body = <StatePanel kind="loading" label="Loading agents" />;
  } else if (list.data === undefined) {
    const { title, detail } = describeError(list.error);
    body = (
      <StatePanel
        kind="error"
        title={title}
        detail={detail}
        onRetry={() => void list.refetch()}
        retrying={list.isFetching}
      />
    );
  } else if (view.kind === 'list') {
    body = (
      <AgentList
        scope={scope}
        list={list.data}
        emptyActions={menu}
        onEdit={(id) => setView({ kind: 'edit', id })}
        onCopied={(id) =>
          setView({
            kind: 'edit',
            id,
            saved: 'Copy created. Change what you need and save.',
          })
        }
      />
    );
  } else if (view.kind === 'edit' && !list.data.agents.some((a) => a.id === view.id)) {
    body = (
      <StatePanel
        kind="empty"
        title="That agent is not in the list any more"
        icon={Bot}
        compact
        actions={
          <Button onClick={() => setView({ kind: 'list' })}>Back to all agents</Button>
        }
      >
        Someone may have removed it from this project. The list is up to date.
      </StatePanel>
    );
  } else {
    body = (
      <AgentEditor
        key={view.kind === 'edit' ? `edit-${view.id}` : `new-${nonce}`}
        scope={scope}
        list={list.data}
        id={view.kind === 'edit' ? view.id : undefined}
        seed={view.kind === 'new' ? view.seed : undefined}
        note={view.kind === 'new' ? view.note : undefined}
        saved={view.kind === 'edit' ? view.saved : undefined}
        onBack={() => setView({ kind: 'list' })}
        onCreated={(id, saved) => setView({ kind: 'edit', id, saved })}
      />
    );
  }

  return (
    <section className="grid gap-6 pb-8">
      {project ? (
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1">
            <h2 className="text-base font-semibold">Agents for this project</h2>
            <p className="max-w-prose text-sm text-muted">
              Company agents apply here. Override one’s instructions or harness for this
              project, switch it off here, or add an agent only this project has.
            </p>
          </div>
          {actions}
        </header>
      ) : (
        <DetailHeader
          crumbs={[{ label: 'Settings', to: '/settings' }, { label: 'Agents' }]}
          icon={Bot}
          title="Agents"
          description={INTRO}
          actions={actions}
        />
      )}
      {body}
      {dialog === 'template' ? (
        <TemplateGallery
          onClose={() => setDialog(null)}
          onPick={(template) =>
            openNew({
              form: formFromFields({ ...template.definition }),
              origin: `template:${template.id}`,
            })
          }
        />
      ) : null}
      {dialog === 'describe' ? (
        <DescribeAgentDialog
          scope={scope}
          onClose={() => setDialog(null)}
          onDrafted={(seed, note) => openNew(seed, note)}
        />
      ) : null}
    </section>
  );
}
