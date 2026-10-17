/**
 * Which harnesses an agent can run on today, and why not when it cannot.
 *
 * Why: an agent names a harness and a model, and the owner should learn that the harness is
 *   paused for quota, failed its compatibility check or never signed in when picking it, not
 *   when a ticket parks. The facts live in three places (the harness row the owner configured,
 *   the compatibility report of the installed build, the quota pause), so this service reads
 *   them once into one `RunsOnHarness` per driver and answers readiness for any `runs_on`.
 *   Each driver id here is a harness the project settings can name; today they all run on the
 *   one configured `claude` setup. The model list is what the build's compatibility report
 *   stored, else what the driver declares, so the picker is never empty.
 *
 * Exports: createAgentReadiness().
 * Depends on: @forge/core (RunsOnHarness, ReadinessLookup), services/harness-source,
 *   types/agent-store. IO: reads storage and asks drivers for their models.
 */

import type { Harness, HarnessModel, ReadinessLookup, RunsOnHarness } from '@forge/core';
import { DEFAULT_HARNESS } from '#/services/harness-source.js';
import type { AgentDeps, AgentReadiness } from '#/types/agent-store.types.js';

const KIND = 'claude';

const clock = (iso: string): string => `${iso.slice(11, 16)} UTC`;

async function driverModels(
  deps: AgentDeps,
  id: string,
): Promise<readonly HarnessModel[]> {
  try {
    return (await deps.ports?.drivers.get(id)?.models()) ?? [];
  } catch {
    return [];
  }
}

function reasonsNotReady(
  row: Harness | null,
  compat: string | undefined,
  pause: { paused_until: string; reason: string } | undefined,
): string[] {
  const reasons: string[] = [];

  if (pause) {
    reasons.push(`Paused until ${clock(pause.paused_until)}: ${pause.reason}`);
  }

  if (row?.status === 'paused') {
    reasons.push(
      row.status_note ?? 'This harness is paused after failing its compatibility check.',
    );
  } else if (compat === 'fail') {
    reasons.push('The installed build failed its compatibility check.');
  }

  if (row?.status === 'error') {
    reasons.push(row.status_note ?? 'The last test of this harness failed.');
  }

  return reasons;
}

/** Reads the current facts about every driver the server can run. */
export function createAgentReadiness(deps: AgentDeps): AgentReadiness {
  async function harnesses(): Promise<RunsOnHarness[]> {
    const ids = deps.ports ? deps.ports.drivers.ids() : [DEFAULT_HARNESS];
    const now = deps.now();
    const facts = await deps.storage.transaction(async (tx) => {
      const row = await tx.harnesses.get(DEFAULT_HARNESS);
      const version = row?.version ?? deps.compat.installedVersion(DEFAULT_HARNESS);
      const known = version === null ? null : await tx.harnessVersions.get(KIND, version);
      const pauses = await tx.harnessState.list();

      return { row, version, known, pauses };
    });

    return Promise.all(
      ids.map(async (id): Promise<RunsOnHarness> => {
        const { row, version, known } = facts;
        const pause = facts.pauses.find(
          (p) => p.harness_id === id && Date.parse(p.paused_until) > now,
        );

        const reasons = reasonsNotReady(row, known?.compat, pause);
        const declared = known?.report?.models ?? (await driverModels(deps, id));

        return {
          id,
          kind: KIND,
          ...(version === null || version === undefined ? {} : { version }),
          signed_in: row?.status === 'ok',
          compat: known?.compat ?? 'pending',
          ...(pause ? { paused_until: pause.paused_until } : {}),
          ready: reasons.length === 0,
          reasons,
          fix_href: `/settings/harnesses/${row?.id ?? DEFAULT_HARNESS}`,
          models: [...declared],
          ...(known?.report?.finished_at
            ? { models_checked_at: known.report.finished_at }
            : {}),
        };
      }),
    );
  }

  return {
    harnesses,
    async lookup(projectDefault: string): Promise<ReadinessLookup> {
      const byId = new Map((await harnesses()).map((h) => [h.id, h]));

      return (runsOn) => {
        const id = runsOn.harness === 'project_default' ? projectDefault : runsOn.harness;
        const h = byId.get(id);

        return h
          ? { ready: h.ready, reasons: h.reasons }
          : {
              ready: false,
              reasons: [`The harness "${id}" is not installed on this server.`],
            };
      };
    },
  };
}
