/**
 * Request bodies of the planning routes: grill answers, plan approval, change requests, ticket edits.
 *
 * Why: the card page answers the Director's questions and steers its plan through these
 *   bodies. Each is parsed before the engine is asked (code.md rule 4), so a malformed
 *   request is a 400 with the offending field, never a half-applied plan edit. An answer is
 *   exactly one of a picked option or free text, a change request needs a real comment, and a
 *   plan version is always a positive whole number: the three things the engine would
 *   otherwise have to guess at.
 *
 * Exports: GrillAnswerBody, GrillShortcutBody, PlanApproveBody, PlanChangesBody, PlanEditBody,
 *   PlanVersionParam (schemas and inferred types).
 * Depends on: @forge/core (CardPriority), zod. No IO.
 */

import { CardPriority } from '@forge/core';
import { z } from 'zod';

/** `POST /cards/:id/grill/answer`: the open question and exactly one of `option_id` and `text`. */
export const GrillAnswerBody = z
  .strictObject({
    question_id: z.string().min(1).max(200),
    option_id: z.string().min(1).max(200).optional(),
    text: z.string().trim().min(1).max(20_000).optional(),
  })
  .refine((body) => (body.option_id === undefined) !== (body.text === undefined), {
    message: 'give exactly one of option_id and text',
    path: ['option_id'],
  });
export type GrillAnswerBody = z.infer<typeof GrillAnswerBody>;

/** `POST /cards/:id/grill/shortcut`. */
export const GrillShortcutBody = z.strictObject({
  kind: z.enum(['use_recommendations', 'write_plan_now']),
});
export type GrillShortcutBody = z.infer<typeof GrillShortcutBody>;

/** A plan version number, in a path or a body. */
export const PlanVersionParam = z.coerce.number().int().positive();

/** `POST /cards/:id/plan/approve`. */
export const PlanApproveBody = z.strictObject({
  version: z.number().int().positive(),
});
export type PlanApproveBody = z.infer<typeof PlanApproveBody>;

/** `POST /cards/:id/plan/request-changes`: the comment is at least 5 characters. */
export const PlanChangesBody = z.strictObject({
  version: z.number().int().positive(),
  comment: z.string().trim().min(5).max(20_000),
});
export type PlanChangesBody = z.infer<typeof PlanChangesBody>;

/** `PATCH /cards/:id/plan/:version/tickets`: light edits by plan ticket key, and the wanted order of the survivors. */
export const PlanEditBody = z.strictObject({
  tickets: z
    .array(
      z.strictObject({
        key: z.string().min(1).max(100),
        title: z.string().trim().min(1).max(300).optional(),
        priority: CardPriority.optional(),
        removed: z.boolean().optional(),
        /** Positions (0-based) of the Director's pipeline ops to take off this ticket; the owner may remove an op, never add one. */
        drop_pipeline_ops: z.array(z.number().int().nonnegative()).max(6).optional(),
      }),
    )
    .max(200),
  order: z.array(z.string().min(1).max(100)).max(200).optional(),
});
export type PlanEditBody = z.infer<typeof PlanEditBody>;
