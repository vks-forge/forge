/**
 * Validation and shaping rules for reading a repository at HEAD.
 *
 * Why: the Director hands a model-chosen path, pattern or sha to git. Whatever the model
 *   writes must be reduced to a plain project-relative path, a short regular expression or a
 *   hex commit id, or be refused before git runs, so a request can never name a file outside the
 *   project, smuggle in a git option or break a multibyte character in half. These are pure
 *   rules; the adapter only runs git once they pass.
 *
 * Exports: normaliseRepoPath(), assertGrepPattern(), assertSha(), cutUtf8(), isUnderAny(),
 *   MAX_PATTERN_LENGTH.
 * Depends on: @forge/core (PolicyDeniedError, InvalidInputError). No IO.
 */

import { InvalidInputError, PolicyDeniedError } from '@forge/core';

/** Longest regular expression a model may ask git to run. */
export const MAX_PATTERN_LENGTH = 500;

const CONTROL = /[\u0000-\u001f\u007f]/;
const PATTERN_CONTROL = /[\u0000-\u0008\u000a-\u001f\u007f]/;
const DRIVE = /^[A-Za-z]:/;
const SHA = /^[0-9a-f]{7,64}$/i;

const segments = (path: string): string[] =>
  path
    .replaceAll('\\', '/')
    .split('/')
    .filter((part) => part !== '' && part !== '.');

/**
 * A project-relative path with forward slashes and no `.` or empty segments. Refuses empty,
 * absolute, drive-letter, UNC, control-character and `..` paths with a PolicyDeniedError.
 */
export function normaliseRepoPath(path: string): string {
  if (path === '' || CONTROL.test(path)) {
    throw new PolicyDeniedError('path is empty or holds control characters');
  }

  const slashed = path.replaceAll('\\', '/');
  if (slashed.startsWith('/') || DRIVE.test(slashed)) {
    throw new PolicyDeniedError(`path must be relative to the project: ${path}`);
  }

  const parts = segments(path);
  if (parts.includes('..')) {
    throw new PolicyDeniedError(`path must stay inside the project: ${path}`);
  }

  if (parts.length === 0) {
    throw new PolicyDeniedError('path names no file');
  }

  return parts.join('/');
}

/** Refuses a grep pattern that is empty, too long or holds control characters (tab is fine). */
export function assertGrepPattern(pattern: string): void {
  if (pattern === '') {
    throw new PolicyDeniedError('grep pattern is empty');
  }

  if (pattern.length > MAX_PATTERN_LENGTH) {
    throw new PolicyDeniedError(`grep pattern is over ${MAX_PATTERN_LENGTH} characters`);
  }

  if (PATTERN_CONTROL.test(pattern)) {
    throw new PolicyDeniedError('grep pattern holds control characters');
  }
}

/** Refuses anything that is not a 7 to 64 digit hex commit id (so never an option or a ref). */
export function assertSha(sha: string): void {
  if (!SHA.test(sha)) {
    throw new InvalidInputError(`not a commit sha: ${JSON.stringify(sha.slice(0, 80))}`);
  }
}

/**
 * The first `maxBytes` bytes of `bytes` as text, cut back to a character boundary so a
 * multibyte character is dropped whole instead of broken.
 */
export function cutUtf8(bytes: Buffer, maxBytes: number): string {
  let end = Math.max(0, Math.min(maxBytes, bytes.length));
  // A continuation byte is 10xxxxxx; the cut sits inside a character while the next byte is one.
  while (end > 0 && end < bytes.length && ((bytes[end] ?? 0) & 0xc0) === 0x80) {
    end -= 1;
  }

  return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, end));
}

/** True when `path` equals one of `scopes` or lies under one; `''` and `.` scope the whole root. */
export function isUnderAny(path: string, scopes: readonly string[]): boolean {
  return scopes.some((raw) => {
    const scope = segments(raw).join('/');

    return scope === '' || path === scope || path.startsWith(`${scope}/`);
  });
}
