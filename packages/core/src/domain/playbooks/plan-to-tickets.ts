/**
 * Plan-to-tickets playbook — the method that turns an approved plan into ordered tickets.
 *
 * Why:
 *   Approval is the one moment tickets are created, and the conversion must be the same
 *   whether the owner or the Director approved. This text is the reference for that conversion
 *   for anyone reading the playbook view: the order, the priority numbers, the ticket body,
 *   and why the lane can only be raised and non-Express tickets are held (d-0133, d-0141).
 *
 * Exports: PLAN_TO_TICKETS_PLAYBOOK.
 * Depends on: schemas/director-config (the DirectorPlaybook type). No IO.
 */

import type { DirectorPlaybook } from '#/schemas/director-config.js';

/** Method text for the plan conversion (deterministic, reference text) step, injected into the step input as the playbook body. */
export const PLAN_TO_TICKETS_PLAYBOOK: DirectorPlaybook = {
  title: 'Plan to tickets',
  body: [
    '# Plan to tickets',
    '',
    'This is the method that turns an approved plan version into tickets. The engine applies it deterministically; read it to know what approval will create. It runs once per (card, version): approving the same version twice creates nothing new.',
    '',
    '## When it runs',
    '',
    'Only when a plan version is approved, by the owner or by the Director behind the approval floor. Nothing is created before. The plan is the only input.',
    '',
    '## Steps',
    '',
    "1. **Order.** Sort the plan's tickets so every ticket comes after the tickets it `depends_on` (topological order). Ties keep plan order, so `t1` before `t2`. The plan is already checked for loops and unknown keys; a stored plan that fails this is an error, never repaired silently.",
    '2. **Create.** Insert each ticket as an inbox ticket in that order. Keep a map from plan key to the new ticket id.',
    '3. **Block.** For every key in `depends_on`, record the mapped ticket id as a blocker of the new ticket. A ticket with blockers waits; a ticket with none can be picked up at once.',
    '4. **Priority.** Map the plan priority to the number: `urgent` 3, `high` 2, `normal` 1, `low` 0.',
    '5. **Body.** Compose the ticket body from three parts, in this order:',
    '   - the plan ticket `body`;',
    '   - an "Acceptance criteria" list, one line per `acceptance` entry;',
    '   - a "Files" list from `files`, so the Worker starts where the plan looked.',
    "6. **Lane.** The ticket's lane is the STRICTER of the plan ticket's `lane` and the deterministic pre-check (`preCheckLane` / `decideLane`) over its files and body. It can only be raised, never lowered. Record the result in a `triaged` event.",
    '7. **Card.** The card moves to approved and then to in progress through the card state door, and a `plan_approved` event lists the created ticket ids.',
    '',
    '## Held tickets',
    '',
    'Until ticket pipelines exist for Standard and Full, a planned ticket whose lane is not Express is held. It gets the wait reason `pipeline_pending` and its inbox item offers one action, run as Express, which re-triages that ticket to Express through the ticket state door. The owner, not the Director, takes that step. An Express ticket is queued as soon as it has no open blockers.',
    '',
    '## Example',
    '',
    '```',
    'plan:   t1 Add the todos table (normal, express)',
    '        t2 Add the complete endpoint (high, standard, depends_on t1)',
    'result: ticket A (priority 1, lane express)  -> queued',
    '        ticket B (priority 2, lane standard) -> blocked by A, held pipeline_pending',
    '```',
    '',
    '## Never',
    '',
    '1. Never create tickets from a draft, an older version or a plan the owner has asked to change.',
    '2. Never skip the lane pre-check, and never lower a lane.',
    '3. Never reorder away a dependency to run work sooner.',
    '4. Never edit the plan while converting; a difference between plan and tickets is a bug, not a choice.',
  ].join('\n'),
};
