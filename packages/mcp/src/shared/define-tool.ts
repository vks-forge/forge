/**
 * defineTool — builds a ForgeToolSpec whose handler receives typed, validated args.
 *
 * Why: the SDK validates arguments, but the handler must never depend on that alone:
 *   a second parse against the same zod shape means the handler's types are true even
 *   when a spec is called directly (tests, future transports), and an invalid call
 *   becomes an `InvalidInputError` the registrar can report as a tool error.
 *
 * Exports: defineTool().
 * Depends on: @forge/core, zod, types/deps.types, types/tool-spec.types. No IO.
 */

import { InvalidInputError } from '@forge/core';
import { z } from 'zod';
import type { ToolContext } from '#/types/deps.types.js';
import type { ForgeToolSpec, ToolRisk } from '#/types/tool-spec.types.js';

export function defineTool<S extends z.ZodRawShape>(def: {
  name: string;
  description: string;
  risk: ToolRisk;
  inputSchema: S;
  /** Refuse unknown argument keys instead of ignoring them (tools whose arguments must not carry scope). */
  strict?: boolean;
  handler: (ctx: ToolContext, args: z.output<z.ZodObject<S>>) => Promise<string>;
}): ForgeToolSpec {
  const schema = def.strict
    ? z.object(def.inputSchema).strict()
    : z.object(def.inputSchema);

  return {
    name: def.name,
    description: def.description,
    risk: def.risk,
    inputSchema: def.inputSchema,
    async run(ctx, rawArgs) {
      const parsed = schema.safeParse(rawArgs ?? {});
      if (!parsed.success) {
        throw new InvalidInputError(
          `invalid arguments for ${def.name}: ${parsed.error.issues
            .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
            .join('; ')}`,
        );
      }

      return def.handler(ctx, parsed.data);
    },
  };
}
