/**
 * Reads a yaml config file and validates it with a zod schema.
 *
 * Why: a typo in `forge.yaml` or `project.yaml` must stop the server at startup with the
 *   file name and the offending keys, not surface as a Worker or gate failing mid-ticket
 *   (code.md rules 4 and 9). Every config file goes through this one function so the
 *   error text is uniform and a missing file always says which file and how to create it.
 *
 * Exports: loadYaml().
 * Depends on: node:fs/promises, yaml, zod, @forge/core (InvalidInputError). IO: reads one file.
 */

import { readFile } from 'node:fs/promises';
import { InvalidInputError } from '@forge/core';
import { parse } from 'yaml';
import type { ZodType } from 'zod';

/** Parses `path` as yaml and validates it; throws InvalidInputError naming the file. */
export async function loadYaml<T>(
  path: string,
  schema: ZodType<T>,
  label: string,
): Promise<T> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (cause) {
    throw new InvalidInputError(`${label} not found or unreadable: ${path}`, { cause });
  }

  let data: unknown;
  try {
    data = parse(text);
  } catch (cause) {
    throw new InvalidInputError(`${label} is not valid yaml: ${path}`, { cause });
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');

    throw new InvalidInputError(`${label} is invalid (${path}): ${issues}`);
  }

  return parsed.data;
}
