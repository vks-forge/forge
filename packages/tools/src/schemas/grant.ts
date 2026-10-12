/**
 * Grant and CallRule schemas — what a layer lets a run see and do.
 *
 * Why: tool policy is layered (lane defaults, project, ticket, operator-managed) and
 *   every layer may only tighten the one above it. A shared shape for "which tools are
 *   visible" (`allow` / `deny` globs) and "what may a visible tool do" (`{action,
 *   resource, effect}` rules) lets the grant builder intersect layers mechanically and
 *   lets a human review a grant file without learning layer-specific formats
 *   (tool-system.md §5.1, §5.2, §13).
 *
 * Exports: Effect, CallRule, Grant.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

export const Effect = z.enum(['allow', 'ask', 'deny']);
export type Effect = z.infer<typeof Effect>;

/** One call-time rule; `save` is the narrower pattern a remembered approval would store. */
export const CallRule = z.object({
  id: z.string().min(1).optional(),
  action: z.string().min(1),
  resource: z.string(),
  effect: Effect,
  save: z.string().optional(),
});
export type CallRule = z.infer<typeof CallRule>;

/**
 * A project or ticket grant. `allow` omitted means "no narrowing of the tool set";
 * present means "only these". `deny` always wins. It can never add a tool the lane
 * ceiling excludes, except naming a project-gated tool the lane lets a project grant.
 */
export const Grant = z.object({
  allow: z.array(z.string().min(1)).optional(),
  deny: z.array(z.string().min(1)).default([]),
  rules: z.array(CallRule).default([]),
});
export type Grant = z.infer<typeof Grant>;
