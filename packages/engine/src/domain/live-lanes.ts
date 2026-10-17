/**
 * Live lanes — the lanes the engine can run a ticket through today.
 *
 * Why: a lane's pipeline is data an owner can edit before the engine can run it. Express and
 *   Standard have a runner; Full is editable but its tickets wait until the update that makes it
 *   live. Which lanes run is a capability of this build, not an owner setting, so it is a
 *   constant in engine code: triage and plan approval hold only tickets of a lane that is not
 *   here, and the per-tick release lifts those holds the moment a lane joins the list.
 *
 * Exports: LIVE_LANES, isLive().
 * Depends on: @forge/core (Lane). No IO.
 */

import type { Lane } from '@forge/core';

export const LIVE_LANES: readonly Lane[] = ['express', 'standard'];

/** True when tickets of `lane` run in this build. */
export const isLive = (lane: Lane): boolean => LIVE_LANES.includes(lane);
