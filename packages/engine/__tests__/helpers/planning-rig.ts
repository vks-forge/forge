/**
 * Planning scenario helpers: a rig with a real folder path, a scripted TODO-app conversation
 *   and readers of the card history.
 *
 * Why: every planning scenario starts the same way (a plan card on a project that has a local
 *   folder and a few tracked files) and tells the same story: the model reads, asks, answers,
 *   verifies and plans. Scripting that story once, with each answer overridable, keeps each
 *   scenario a short statement of the one thing it pins, and the readers show the card history
 *   the owner would see.
 *
 * Exports: TODO_FILES, makeDraftQuestion(), todoPlan(), scriptTodo(), planningRig(), createPlanCard(),
 *   events(), eventsOf(), kinds(), cardOf(), planOf(), tickets(), pick(), readOks(), oneTicketPlan(), planUntilDecision(), answerWith().
 * Depends on: @forge/core, helpers/rig, helpers/scripted-llm. No IO.
 */

import type { Card, CardEvent, CardId, PlanVersion, Ticket } from '@forge/core';
import { makeRig } from '#tests/helpers/rig.js';
import type { Rig, RigOptions } from '#tests/helpers/rig.js';
import type { CreateCardInput } from '#/types/card-create.types.js';

/** Tracked files of the test project. */
export const TODO_FILES: Record<string, string> = {
  'package.json': '{"name":"todo","scripts":{"test":"vitest"}}',
  'src/index.ts': 'export const app = 1;\n',
  'CLAUDE.md': '# Rules\nUse small functions.\n',
};

/** A grill question as the model writes it: option labels with the recommended one marked. */
export const makeDraftQuestion = (
  text: string,
  labels: string[] = ['Local storage', 'A server'],
) => ({
  text,
  why: 'It decides the data layer.',
  options: labels.map((label, i) => ({ label, recommended: i === 0 })),
});

/** A valid `write_plan` answer with two dependent tickets; `over` replaces fields. */
export function todoPlan(over: Record<string, unknown> = {}): Record<string, unknown> {
  const t = (key: string, depends_on: string[], files: string[], extra = {}) => ({
    key,
    title: `Ticket ${key}`,
    body: `Do ${key}.`,
    acceptance: [`${key} works`],
    priority: 'normal',
    depends_on,
    lane: 'express',
    size: 'S',
    files,
    ...extra,
  });

  return {
    summary: 'Two tickets.',
    goal: 'A small todo application',
    scope: ['list todos', 'add a todo'],
    non_goals: ['sync'],
    assumptions: ['single user'],
    risks: [],
    tickets: [
      t('t1', [], ['src/store.ts'], { priority: 'high' }),
      t('t2', ['t1'], ['src/ui.ts']),
    ],
    card_links: [],
    ...over,
  };
}

/** Scripts the whole TODO-app conversation: a read round, one question, verify, plan; `over` replaces a step's answers. */
export function scriptTodo(
  rig: Rig,
  over: Partial<Record<string, unknown[]>> = {},
): void {
  const s = rig.llm.script.bind(rig.llm);
  s(
    'card_survey',
    ...(over['card_survey'] ?? [
      {
        read_requests: [
          { op: 'read', path: 'package.json' },
          { op: 'glob', pattern: 'src/**' },
        ],
      },
      {
        findings: {
          summary: 'A bare TypeScript project.',
          relevant_files: ['package.json'],
          predicted_lane: 'standard',
          predicted_files: ['src/store.ts', 'src/ui.ts'],
        },
      },
    ]),
  );

  s(
    'grill_turn',
    ...(over['grill_turn'] ?? [
      {
        done: false,
        question: makeDraftQuestion('Where are todos stored?'),
        open_points: 1,
        assumptions: [],
      },
      {
        done: true,
        done_reason: 'nothing_open',
        open_points: 0,
        assumptions: ['English only'],
      },
    ]),
  );

  s(
    'verify',
    ...(over['verify'] ?? [
      {
        findings: {
          summary: 'Nothing conflicts.',
          blast_radius: 'two new files',
          predicted_files: ['src/store.ts', 'src/ui.ts'],
        },
      },
    ]),
  );

  s(
    'enhance',
    ...(over['enhance'] ?? [
      {
        summary: 'Fine.',
        report: '# Enhance\n\nKeep both tickets.',
        assumptions: [],
        owner_questions: [],
      },
    ]),
  );

  s('write_plan', ...(over['write_plan'] ?? [todoPlan()]));
  s(
    'approve_plan',
    ...(over['approve_plan'] ?? [{ decision: 'approve', questions: [] }]),
  );
}

/** A rig whose project has a local folder and tracked files, with the TODO conversation scripted. */
export async function planningRig(opts: RigOptions = {}): Promise<Rig> {
  const rig = await makeRig(opts);
  await rig.seedProject({ local_path: '/repo/forge' });
  rig.repo.files = { ...TODO_FILES };
  scriptTodo(rig);

  return rig;
}

/** Creates a plan card ("TODO app") and returns its id. */
export async function createPlanCard(
  rig: Rig,
  over: Partial<CreateCardInput> = {},
): Promise<CardId> {
  const out = await rig.engine.createCard({
    project: 'forge',
    title: 'TODO app',
    description: 'i want to create a TODO application',
    type: 'plan',
    priority: 'normal',
    depends_on: [],
    blocks: [],
    links: [],
    dedupe_key: `k-${Math.random()}`,
    actor: { type: 'user', id: 'owner' },
    ...over,
  });

  if (out.status !== 'created') {
    throw new Error(`card not created: ${out.status}`);
  }

  return out.card.id;
}

export const events = (rig: Rig, id: CardId): Promise<CardEvent[]> =>
  rig.storage.transaction((tx) => tx.cardEvents.list(id, { limit: 500 }));

export const eventsOf = async <K extends CardEvent['kind']>(
  rig: Rig,
  id: CardId,
  kind: K,
): Promise<Extract<CardEvent, { kind: K }>[]> =>
  (await events(rig, id)).filter(
    (e): e is Extract<CardEvent, { kind: K }> => e.kind === kind,
  );

export const kinds = async (rig: Rig, id: CardId): Promise<string[]> =>
  (await events(rig, id)).map((e) => e.kind);

export const cardOf = async (rig: Rig, id: CardId): Promise<Card> => {
  const c = await rig.storage.transaction((tx) => tx.cards.get(id));
  if (!c) {
    throw new Error(`no card ${id}`);
  }

  return c;
};

export const planOf = (
  rig: Rig,
  id: CardId,
  version?: number,
): Promise<PlanVersion | null> =>
  rig.storage.transaction((tx) =>
    version === undefined
      ? tx.cardPlanning.latestPlan(id)
      : tx.cardPlanning.getPlan(id, version),
  );

export const tickets = (rig: Rig, id: CardId): Promise<Ticket[]> =>
  rig.storage.transaction((tx) => tx.tickets.listByCard(id));

/** A plan body with one express ticket on the given files (for floor scenarios). */
export const oneTicketPlan = (files: string[]): Record<string, unknown> =>
  todoPlan({
    tickets: [
      {
        key: 't1',
        title: 'Touch policy',
        body: 'Edit it.',
        acceptance: ['done'],
        priority: 'normal',
        depends_on: [],
        lane: 'express',
        size: 'S',
        files,
      },
    ],
  });

/** Plans a card up to the point where the Director decided: approved it, or asked the owner. */
export async function planUntilDecision(rig: Rig): Promise<CardId> {
  const id = await createPlanCard(rig);
  await rig.tick();
  await answerWith(rig, id);
  await rig.tick();

  return id;
}

/** The value at a dotted path of a step input (`grill.answers`, `read_results.0.ok`), or undefined. */
export function pick(value: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (v, key) =>
        v !== null && typeof v === 'object'
          ? (v as Record<string, unknown>)[key]
          : undefined,
      value,
    );
}

/** The `ok` flag of each read result a step was handed. */
export const readOks = (input: unknown): boolean[] =>
  (pick(input, 'read_results') as { ok: boolean }[]).map((r) => r.ok);

/** Answers the card's open question with its recommended option. */
export async function answerWith(
  rig: Rig,
  id: CardId,
  which: 'recommended' | 'other' = 'recommended',
) {
  const open = (await eventsOf(rig, id, 'grill_question')).at(-1)?.payload;
  if (!open) {
    throw new Error('no open question');
  }

  const option = open.options.find((o) => o.recommended) ?? open.options[0];

  return rig.engine.answerGrill(
    id,
    which === 'recommended'
      ? { question_id: open.question_id, option_id: option?.id ?? '' }
      : { question_id: open.question_id, text: 'something else' },
    'owner',
  );
}
