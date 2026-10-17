/**
 * Redaction of trace entries: the one pass that runs before anything is written.
 *
 * Why: the trace keeps full content (prompts, tool inputs, HTTP bodies, run requests), so a
 *   secret that reaches an entry would land in a plain file the owner may share. Three nets
 *   catch it: by key (an `Authorization` header, a field named token, secret, password, key,
 *   cookie), by shape (GitHub and API key prefixes, bearer text, session cookies, PEM blocks)
 *   and by value (the install token, SecretStore values, env passthrough values, and any
 *   value this process has seen under a secret-named key, which is how run tokens are
 *   learned). Everything is made plain JSON first so exotic values (errors, bigint, maps,
 *   cycles) cannot crash the writer. Anything unexpected throws and the caller drops the
 *   entry: an unredacted entry is never written (d-0163).
 *
 * Exports: createRedactor(), REDACTED.
 * Depends on: @forge/core (TraceEntry type), types/trace. No IO.
 */

import type { TraceEntry } from '@forge/core';
import type { Redactor } from '#/types/trace.types.js';

export const REDACTED = '[redacted]';

const MAX_DEPTH = 40;
const MIN_SECRET_LENGTH = 6;
const MIN_LEARNED_LENGTH = 8;
const MAX_LEARNED = 500;

const SECRET_WORDS =
  /authorization|cookie|secret|password|passwd|api[_-]?key|private[_-]?key|credential|bearer|access[_-]?key/i;

const PATTERNS: readonly RegExp[] = [
  /-----BEGIN [A-Z0-9 ]+-----[\s\S]*?(?:-----END [A-Z0-9 ]+-----|$)/g,
  /\bgh[pousr]_[A-Za-z0-9]{8,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{8,}/g,
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{8,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\bforge_session=[A-Za-z0-9_-]+/g,
];

/** True for a key that holds a credential; plural `tokens` is a counter, not a secret. */
function isSecretKey(key: string): boolean {
  if (SECRET_WORDS.test(key)) {
    return true;
  }

  return /token/i.test(key) && !/tokens$/i.test(key);
}

function scrub(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (out.includes(secret)) {
      out = out.split(secret).join(REDACTED);
    }
  }

  for (const pattern of PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }

  return out;
}

/** Plain-JSON copy of `value`; secret-named keys are replaced and their values returned in `found`. */
function plain(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
  found: string[],
): unknown {
  if (value === null || typeof value === 'boolean') {
    return value;
  }

  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
      return Number.isFinite(value) ? value : String(value);
    case 'bigint':
      return value.toString();
    case 'undefined':
    case 'function':
    case 'symbol':
      return undefined;
    default:
      break;
  }

  const obj = value as object;
  if (depth >= MAX_DEPTH) {
    return '[too deep]';
  }

  if (seen.has(obj)) {
    return '[circular]';
  }

  seen.add(obj);
  try {
    if (obj instanceof Date) {
      return Number.isNaN(obj.getTime()) ? 'invalid date' : obj.toISOString();
    }

    if (obj instanceof Error) {
      return {
        name: obj.name,
        message: obj.message,
        ...(obj.stack ? { stack: obj.stack } : {}),
      };
    }

    if (obj instanceof Uint8Array) {
      return { bytes: obj.byteLength };
    }

    if (obj instanceof Map) {
      return plain([...obj.entries()], depth + 1, seen, found);
    }

    if (obj instanceof Set) {
      return plain([...obj.values()], depth + 1, seen, found);
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => plain(item, depth + 1, seen, found) ?? null);
    }

    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(obj)) {
      if (isSecretKey(key)) {
        if (typeof item === 'string' && item.length >= MIN_LEARNED_LENGTH) {
          found.push(item);
        }

        out[key] = REDACTED;
        continue;
      }

      const copy = plain(item, depth + 1, seen, found);
      if (copy !== undefined) {
        out[key] = copy;
      }
    }

    return out;
  } finally {
    seen.delete(obj);
  }
}

function scrubTree(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === 'string') {
    return scrub(value, secrets);
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubTree(item, secrets));
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        scrub(key, secrets),
        scrubTree(item, secrets),
      ]),
    );
  }

  return value;
}

/** A redactor that remembers secret values it has seen under secret-named keys. */
export function createRedactor(): Redactor {
  const learned = new Set<string>();

  return {
    redact(entry: TraceEntry, secrets: readonly string[]): TraceEntry {
      const found: string[] = [];
      const copy = plain(entry, 0, new WeakSet(), found);
      for (const value of found) {
        if (learned.size >= MAX_LEARNED) {
          // Oldest first: a Set iterates in insertion order.
          learned.delete(learned.values().next().value as string);
        }

        learned.add(value);
      }

      const values = [...secrets, ...learned]
        .filter((s) => s.length >= MIN_SECRET_LENGTH)
        .sort((a, b) => b.length - a.length);

      return scrubTree(copy, values) as TraceEntry;
    },
  };
}
