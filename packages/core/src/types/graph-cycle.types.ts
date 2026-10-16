/**
 * The edge shape the cycle check reads.
 *
 * Why: cards depend on cards now and tickets depend on tickets (d-0110), and both need
 *   the same "would this edge close a loop" answer. One generic edge, "`from` waits for
 *   `to`", lets a single pure function serve both id types without either caller converting.
 *
 * Exports: GraphEdge.
 * Depends on: none. Types only.
 */

/** `from` depends on (waits for) `to`. */
export interface GraphEdge<T extends string> {
  readonly from: T;
  readonly to: T;
}
