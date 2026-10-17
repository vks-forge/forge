/**
 * PipelinesWorkspace: the pipelines screen of one scope: the three lanes and, in a project, its routing rules.
 *
 * Why: Forge settings (the company defaults) and a project's settings (its own lists and routing
 *   rules) show the same lanes over different data, so one workspace serves both and the two
 *   pages stay thin. A lane's pipeline is the answer to "how much process does a ticket of this
 *   size get": the owner reads it as an ordered list, edits it, and each save is a versioned,
 *   attributed change. The workspace gives every state its own face: loading while the lists
 *   are read, an error with a retry when the server cannot be reached, an empty roster (no
 *   agents means no stage can be built, and the way forward is the Agents screen), and the
 *   lanes. The lane tabs only choose which pane shows; every pane stays mounted so an unsaved
 *   edit survives a look at another lane.
 *
 * Exports: PipelinesWorkspace.
 * Depends on: react, react-router, lucide-react, api/use-agents, api/use-pipelines,
 *   components/pipelines/*, components/settings/detail-header, components/status/state-panel,
 *   domain/{nav-entries,pipeline-copy}.
 */

import { Bot, Workflow } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import { describeError } from '#/api/describe-error.js';
import { useAgents } from '#/api/use-agents.js';
import { usePipelines } from '#/api/use-pipelines.js';
import { LanePane } from '#/components/pipelines/lane-pane.js';
import { LaneTabs, lanePanelId, laneTabId } from '#/components/pipelines/lane-tabs.js';
import { RoutingRulesEditor } from '#/components/pipelines/routing-rules-editor.js';
import { DetailHeader } from '#/components/settings/detail-header.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { projectPath } from '#/domain/nav-entries.js';
import { LANE_ORDER } from '#/domain/pipeline-copy.js';
import type { PipelineScope } from '#/types/pipeline-api.types.js';
import type { Lane } from '@forge/core';

const INTRO =
  'A pipeline is the ordered list of stages a ticket of one lane goes through: who writes, which gate and reviews judge the work, and when it waits for you. Tickets already started keep the pipeline they began with.';

export function PipelinesWorkspace(props: { scope: PipelineScope }) {
  const { scope } = props;
  const pipelines = usePipelines(scope);
  const agents = useAgents(scope);
  const [params, setParams] = useSearchParams();
  const asked = params.get('lane');
  const lane: Lane = LANE_ORDER.find((l) => l === asked) ?? 'express';
  const project = scope.kind === 'project';

  useEffect(() => {
    if (!project) {
      document.title = 'Pipelines · Forge settings · Forge';
    }
  }, [project]);

  const header = project ? (
    <header className="grid gap-1">
      <h2 className="text-base font-semibold">Pipelines for this project</h2>
      <p className="max-w-prose text-sm text-muted">
        Each lane follows the company default until you change it here. A change applies
        to this project only, and Reset puts the lane back on the company default.
      </p>
    </header>
  ) : (
    <DetailHeader
      crumbs={[{ label: 'Settings', to: '/settings' }, { label: 'Pipelines' }]}
      icon={Workflow}
      title="Pipelines"
      description={INTRO}
    />
  );

  let body;

  if (
    (pipelines.data === undefined && pipelines.isPending) ||
    (agents.data === undefined && agents.isPending)
  ) {
    body = <StatePanel kind="loading" label="Loading pipelines" />;
  } else if (pipelines.data === undefined || agents.data === undefined) {
    const { title, detail } = describeError(pipelines.error ?? agents.error);

    body = (
      <StatePanel
        kind="error"
        title={title}
        detail={detail}
        onRetry={() => {
          void pipelines.refetch();
          void agents.refetch();
        }}
        retrying={pipelines.isFetching || agents.isFetching}
      />
    );
  } else if (agents.data.agents.length === 0) {
    body = (
      <StatePanel
        kind="empty"
        icon={Bot}
        title="There are no agents to build a pipeline from"
        compact
        actions={
          <Link
            className="font-medium text-signal underline"
            to={project ? projectPath(scope.slug, 'settings/agents') : '/settings/agents'}
          >
            Open Agents
          </Link>
        }
      >
        A stage runs an agent. Add or switch on an agent first.
      </StatePanel>
    );
  } else {
    const { data: list } = pipelines;
    const roster = agents.data.agents;

    body = (
      <div className="grid gap-6">
        <div className="grid gap-4">
          <LaneTabs
            active={lane}
            onChange={(next) => setParams({ lane: next }, { replace: true })}
          />
          {LANE_ORDER.map((id) => (
            <div
              key={id}
              role="tabpanel"
              id={lanePanelId(id)}
              aria-labelledby={laneTabId(id)}
              hidden={id !== lane}
            >
              <LanePane scope={scope} lane={id} list={list} roster={roster} />
            </div>
          ))}
        </div>
        {project ? (
          <RoutingRulesEditor slug={scope.slug} list={list} roster={roster} />
        ) : null}
      </div>
    );
  }

  return (
    <section className="grid gap-6 pb-8">
      {header}
      {body}
    </section>
  );
}
