/**
 * A mock Engine for route tests: every door is a `vi.fn()` with the answer routes expect by default.
 *
 * Why: the route tests check what an HTTP route does with the engine's answer, not the engine, so
 *   each door is a spy that returns a harmless default. Keeping the list in one place means a new
 *   engine door (the planning doors added with the plan routes) is added once, not in every test file
 *   that builds routes, and the compiler flags a mock that forgot one.
 *
 * Exports: EngineMock, makeEngineMock().
 * Depends on: @forge/engine (Engine type), vitest. No IO.
 */

import type { Engine } from '@forge/engine';
import { vi } from 'vitest';

export type EngineMock = { [K in keyof Engine]: ReturnType<typeof vi.fn> };

export function makeEngineMock(): EngineMock {
  return {
    tick: vi.fn(),
    requestTick: vi.fn(),
    ingest: vi.fn(async () => ({ status: 'ticket_created', ticketId: 'FX-1' })),
    answerInteraction: vi.fn(async () => true),
    steerRun: vi.fn(),
    postCardMessage: vi.fn(),
    createCard: vi.fn(),
    setCardRelations: vi.fn(),
    answerGrill: vi.fn(),
    grillShortcut: vi.fn(),
    approvePlan: vi.fn(),
    requestPlanChanges: vi.fn(),
    editPlanTickets: vi.fn(),
    startPlanning: vi.fn(),
    retryPlanningStep: vi.fn(),
    runAsExpress: vi.fn(),
    cardPlans: vi.fn(),
    cardPlan: vi.fn(),
    actOnEscalation: vi.fn(),
    actOnTicket: vi.fn(),
    cardDirector: vi.fn(() => ({ state: 'idle' })),
    cancelTicket: vi.fn(),
    reviewOf: vi.fn(async () => null),
    closeCardWork: vi.fn(async () => []),
    explainWait: vi.fn(async () => null),
    interruptRun: vi.fn(),
    liveRunIds: vi.fn(() => ['run-a', 'run-b']),
    unservableProjects: vi.fn(() => new Map()),
    gateJobsInFlight: vi.fn(() => 1),
  };
}
