/**
 * End to end: a parked question is answered exactly once.
 *
 * Why: when a Worker asks the Director a question the ticket waits for a human. The answer
 *   must wake the ticket once; a double click, a retry after a timeout or a second tab
 *   must get 409 and change nothing, and a wrong id must say 404, not pretend someone else
 *   answered. The question here is raised the real way: the Worker calls the `ask_director`
 *   MCP tool (through its own hook receipt), the run pauses, the ticket parks, and
 *   `GET /tickets/:id` lists the pending interaction.
 *
 * Pins: a pending interaction appears on the ticket; the first answer is 200, the second
 *   409; an unknown interaction is 404 and a body without `answer` is 400; the ticket then
 *   resumes and finishes.
 * Depends on: helpers/e2e-rig. IO: git, SQLite, npm, a loopback socket.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { intakeBody, startE2eRig } from '#tests/helpers/e2e-rig.js';
import type { E2eRig } from '#tests/helpers/e2e-rig.js';
import { waitFor } from '#tests/helpers/wait-for.js';

interface TicketView {
  ticket: { status: string };
  interactions: { id: string; status: string; kind: string }[];
}

const view = async (rig: E2eRig): Promise<TicketView> =>
  (await rig.call('GET', '/tickets/FX-1')).body as TicketView;

// The answered ticket resumes with a second Worker run and a full G1, so the test waits for
// `done` to leave no gate process behind; the limits allow for a loaded machine.
describe('answering an interaction', { timeout: 360_000 }, () => {
  let rig: E2eRig;
  let pendingId = '';

  beforeAll(async () => {
    rig = await startE2eRig(['ask', 'good']);
    await rig.call('POST', '/intake', intakeBody('ask-1'));
    const parked = await waitFor(
      'a pending interaction',
      async () => {
        const found = await view(rig);

        return found.ticket.status === 'waiting_human' && found.interactions.length === 1
          ? found
          : false;
      },
      200_000,
    );

    pendingId = parked.interactions[0]?.id ?? '';
  }, 360_000);

  afterAll(async () => {
    await rig.dispose();
  });

  it('lists the question as pending on the parked ticket', async () => {
    const found = await view(rig);

    expect(found.interactions).toEqual([
      expect.objectContaining({ id: pendingId, kind: 'question', status: 'pending' }),
    ]);
  });

  it('rejects a body without an answer and an unknown id', async () => {
    const empty = await rig.call('POST', `/interactions/${pendingId}/answer`, {});
    const unknown = await rig.call('POST', '/interactions/int-nope/answer', {
      answer: 'x',
    });

    expect(empty.status).toBe(400);
    expect(unknown.status).toBe(404);
  });

  it('accepts the first answer, refuses the second, and the ticket finishes', async () => {
    const first = await rig.call('POST', `/interactions/${pendingId}/answer`, {
      answer: 'Put add() in src/math.js.',
    });

    const second = await rig.call('POST', `/interactions/${pendingId}/answer`, {
      answer: 'Put it somewhere else.',
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);

    await waitFor(
      'the answered ticket to finish',
      async () => (await view(rig)).ticket.status === 'done',
      300_000,
    );
  });
});
