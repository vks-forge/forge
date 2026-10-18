/**
 * Live lanes — the lanes the engine can run a ticket through today.
 *
 * Why: a lane's pipeline is data an owner can edit, and the engine can only run a lane it has
 *   a runner for. All three lanes run now (Express, Standard, Full with its Director check and
 *   sign-off). Which lanes run is a capability of this build, not an owner setting, so it stays a
 *   constant in engine code: triage and plan approval hold only tickets of a lane that is not
 *   here, and the per-tick release lifts those holds the moment a lane joins the list, which is
 *   how Full tickets held by an earlier build resume by themselves.
 *
 * Exports: LIVE_LANES, isLive().
 * Depends on: @forge/core (Lane). No IO.
 */

import type { Lane } from '@forge/core';

export const LIVE_LANES: readonly Lane[] = ['express', 'standard', 'full'];

/** True when tickets of `lane` run in this build. */
export const isLive = (lane: Lane): boolean => LIVE_LANES.includes(lane);
