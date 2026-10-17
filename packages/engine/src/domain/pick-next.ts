/**
 * pickNext — which waiting tickets get a Worker slot now, and why the rest do not.
 *
 * Why: a few Worker slots are shared by every project on the machine, and the account behind
 *   them has a quota. Taking tickets by number would let one busy project fill every slot
 *   while the others wait for days, and starting tickets on a harness that is out of quota
 *   would fail the same way each time. This one pure function is the door for that choice
 *   (d-0097): committed work (a due wake: a retry, a resume, a rework) goes before new
 *   tickets; inside each group the projects take turns, starting after the project that got
 *   the last slot, so with any slot at all every project with work reaches the front within
 *   as many ticks as there are projects; inside a project the highest priority goes first,
 *   then the lowest ticket number. A candidate is skipped, with a stated reason, when its card is
 *   being re-planned (the new plan may replace it), when it has unfinished blockers, its harness is parked until a quota reset, or starting it would
 *   exceed the global, per-project, per-harness or In Progress limit. The same call answers
 *   the ticket page's "why is this waiting?", so the explanation can never disagree with
 *   what dispatch does.
 *
 * Exports: pickNext(), orderCandidates().
 * Depends on: types/pick-next. No IO.
 */

import type {
  PickCandidate,
  PickCaps,
  PickResult,
  PickRunning,
  WaitReason,
} from '#/types/pick-next.types.js';

const compare = (a: PickCandidate, b: PickCandidate): number =>
  b.priority - a.priority ||
  a.number - b.number ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * One group in start order: round-robin over projects (sorted by id, beginning with the
 * first project after `cursor`), taking each project's candidates by priority then number.
 */
export function orderCandidates(
  group: readonly PickCandidate[],
  cursor?: string,
): PickCandidate[] {
  const byProject = new Map<string, PickCandidate[]>();
  for (const c of group) {
    byProject.set(c.project, [...(byProject.get(c.project) ?? []), c]);
  }

  const projects = [...byProject.keys()].sort();
  const after = cursor === undefined ? -1 : projects.findIndex((p) => p > cursor);
  const start = after === -1 ? 0 : after;
  const queues = [...projects.slice(start), ...projects.slice(0, start)].map((p) =>
    [...(byProject.get(p) ?? [])].sort(compare),
  );

  const out: PickCandidate[] = [];
  for (let round = 0; out.length < group.length; round++) {
    for (const queue of queues) {
      const next = queue[round];
      if (next) {
        out.push(next);
      }
    }
  }

  return out;
}

const count = <T>(items: readonly T[], match: (item: T) => boolean): number =>
  items.filter(match).length;

/**
 * Chooses the candidates to start, in order, within `caps` given the `running` runs, and
 * gives every other candidate its wait reason. `cursor` is the `cursor` of the previous
 * result (undefined at the first tick); `now` is epoch ms.
 */
export function pickNext(
  candidates: readonly PickCandidate[],
  running: readonly PickRunning[],
  caps: PickCaps,
  now: number,
  cursor?: string,
): PickResult {
  const waits = new Map<string, WaitReason>();

  // Unfinished blockers and a parked harness hold a ticket back whatever else is free, so
  // those tickets sit out of the rotation: they must not use up a project's turn.
  const staticWait = (c: PickCandidate): WaitReason | null => {
    if (c.awaitsPlan === true) {
      return { kind: 'plan' };
    }

    if (c.blockedBy.length > 0) {
      return { kind: 'deps', ids: c.blockedBy };
    }

    const pause = caps.paused[c.harness];

    return pause && pause.until > now
      ? { kind: 'quota', harness: c.harness, until: pause.until, reason: pause.reason }
      : null;
  };

  const eligible: PickCandidate[] = [];
  for (const c of candidates) {
    const wait = staticWait(c);
    if (wait) {
      waits.set(c.id, wait);
    } else {
      eligible.push(c);
    }
  }

  const ordered = [
    ...orderCandidates(
      eligible.filter((c) => c.wake),
      cursor,
    ),
    ...orderCandidates(
      eligible.filter((c) => !c.wake),
      cursor,
    ),
  ];

  const live: PickRunning[] = [...running];
  let inProgress = caps.inProgress.used;
  const picked: PickCandidate[] = [];

  const blocker = (c: PickCandidate): WaitReason | null => {
    if (c.entering && inProgress >= caps.inProgress.limit) {
      return {
        kind: 'cap',
        scope: 'state',
        name: 'in_progress',
        used: inProgress,
        limit: caps.inProgress.limit,
      };
    }

    if (live.length >= caps.global) {
      return { kind: 'cap', scope: 'global', used: live.length, limit: caps.global };
    }

    const projectUsed = count(live, (r) => r.project === c.project);
    const projectLimit = caps.perProject.byProject[c.project] ?? caps.perProject.default;
    if (projectUsed >= projectLimit) {
      return {
        kind: 'cap',
        scope: 'project',
        name: c.project,
        used: projectUsed,
        limit: projectLimit,
      };
    }

    const harnessUsed = count(live, (r) => r.harness === c.harness);
    const harnessLimit = caps.perHarness.byId[c.harness] ?? caps.perHarness.default;
    if (harnessUsed >= harnessLimit) {
      return {
        kind: 'cap',
        scope: 'harness',
        name: c.harness,
        used: harnessUsed,
        limit: harnessLimit,
      };
    }

    return null;
  };

  let last = cursor;
  for (const c of ordered) {
    const wait = blocker(c);
    if (wait) {
      waits.set(c.id, wait);

      continue;
    }

    picked.push(c);
    live.push({ project: c.project, harness: c.harness });
    if (c.entering) {
      inProgress++;
    }

    last = c.project;
  }

  return { picked, waits, cursor: last };
}
