/**
 * Tool specification type.
 *
 * Why: every Forge tool needs the same envelope (description, zod input shape, a handler
 *   that returns plain text). A single shape lets one registrar apply the run-active
 *   check and the error mapping to all of them, so no tool can forget either.
 *
 * Exports: ToolRisk, ForgeToolSpec.
 * Depends on: zod, types/deps.types. No IO.
 */

import type { z } from 'zod';
import type { ToolContext } from '#/types/deps.types.js';

/** Declared risk class, mirrored in `.forge/tools/catalog.yaml`. */
export type ToolRisk = 'read' | 'write-cwd' | 'network';

export interface ForgeToolSpec {
  name: string;
  description: string;
  risk: ToolRisk;
  inputSchema: z.ZodRawShape;
  /** Validates `rawArgs` against the schema, then runs the handler. */
  run(ctx: ToolContext, rawArgs: unknown): Promise<string>;
}
