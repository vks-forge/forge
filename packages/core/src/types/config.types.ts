/**
 * Config helper types.
 *
 * Why: override documents are the same shape as the full config with every key
 *   optional at every depth. Zod cannot derive that type from the strict override
 *   schemas it builds at runtime, so it is declared once here and the schemas are
 *   typed against it; the compiler then checks that a merged override still fits
 *   the config it overrides.
 *
 * Exports: DeepPartial, AnyDef.
 * Depends on: zod (types only).
 */

import type { z } from 'zod';

/** `T` with every object key optional at every depth; arrays are replaced whole, not partial. */
export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/** The slice of a zod schema's internal definition that `deepPartial` reads. */
export interface AnyDef {
  readonly type: string;
  readonly shape?: Record<string, z.ZodType>;
  readonly innerType?: z.ZodType;
  readonly keyType?: z.ZodType;
  readonly valueType?: z.ZodType;
}
