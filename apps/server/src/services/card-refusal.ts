/**
 * Maps the engine's refusal of a card dependency to the HTTP error the contract names.
 *
 * Why: the create-card form and the relations edit refuse the same three things (an id that
 *   is no card, a card from another project, a dependency loop), and the web client keys its
 *   inline messages on the error code, so the status and code must be identical on both
 *   routes. A loop carries its path so the form can say which card already depends on this
 *   one. One function holds that mapping.
 *
 * Exports: refusalError().
 * Depends on: @forge/engine (RelationRefusal), services/http/http-errors. No IO.
 */

import type { RelationRefusal } from '@forge/engine';
import { HttpError } from '#/services/http/http-errors.js';

/** The `HttpError` for a refused dependency: 404 `card_not_found`, 400 `cross_project_dependency`, 409 `dependency_cycle` with `cycle`. */
export function refusalError(refusal: RelationRefusal): HttpError {
  switch (refusal.status) {
    case 'card_not_found':
      return new HttpError(404, 'card_not_found', `no card ${refusal.id}`);
    case 'cross_project_dependency':
      return new HttpError(
        400,
        'cross_project_dependency',
        `card ${refusal.id} belongs to another project`,
      );
    case 'dependency_cycle':
      return new HttpError(
        409,
        'dependency_cycle',
        `these dependencies would make cards wait on each other: ${refusal.cycle.join(' -> ')}`,
        { cycle: refusal.cycle },
      );
  }
}
