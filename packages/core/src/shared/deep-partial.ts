/**
 * deepPartial — derive a strict, every-key-optional override schema from a config schema.
 *
 * Why: company and project settings are stored as overrides of a full config. Writing the
 *   override shapes by hand would duplicate every key of `ForgeConfig` and `ProjectConfig`
 *   and drift the first time a dial is added. Deriving them keeps the full schema the one
 *   source of truth. The result is strict, so a mistyped key in a stored override is
 *   rejected on write instead of silently doing nothing; defaults are stripped so an
 *   override that omits a key never injects the default over a more specific layer.
 *
 * Exports: deepPartial().
 * Depends on: types/config.types, zod. No IO.
 */

import { z } from 'zod';
import type { AnyDef } from '#/types/config.types.js';

const defOf = (schema: z.ZodType): AnyDef =>
  (schema as unknown as { _zod: { def: AnyDef } })._zod.def;

/**
 * Objects become strict objects with every field optional (recursively); records become
 * partial records of partial values; defaults and optionals are unwrapped; arrays, unions
 * and scalars are left whole, so an override replaces them rather than merging into them.
 */
export function deepPartial(schema: z.ZodType): z.ZodType {
  const def = defOf(schema);

  if (def.type === 'object' && def.shape) {
    const shape: Record<string, z.ZodType> = {};
    for (const [key, field] of Object.entries(def.shape)) {
      shape[key] = deepPartial(field).optional();
    }

    return z.strictObject(shape);
  }

  if ((def.type === 'default' || def.type === 'optional') && def.innerType) {
    return deepPartial(def.innerType);
  }

  if (def.type === 'record' && def.keyType && def.valueType) {
    return z.partialRecord(def.keyType as z.ZodType<string>, deepPartial(def.valueType));
  }

  return schema;
}
