/**
 * Shapes of the blocking-route rule.
 *
 * Why: where a stage's blocking result goes (back for rework, held for the owner, or the rework cap)
 *   depends on what produced the block, the stage's own policy and how many automatic reworks are
 *   spent. Naming the inputs and the three answers keeps `blockingRoute` a plain function and lets
 *   the engine's send-back doors and the property tests speak the same words.
 *
 * Exports: BlockClass, BlockRoute, BlockRouteInput.
 * Depends on: nothing. Types only.
 */

/** What produced the block: a deterministic gate, a check agent, or the Director's check. */
export type BlockClass = 'gate' | 'check' | 'director_check';

/** `rework` sends the work back, `hold` parks it for the owner, `rework_cap` is the gate failure at the cap. */
export type BlockRoute = 'rework' | 'hold' | 'rework_cap';

export interface BlockRouteInput {
  readonly klass: BlockClass;
  readonly policy: 'rework' | 'hold';
  readonly reworkCount: number;
  readonly cap: number;
}
