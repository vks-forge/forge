/**
 * Secret scrubbing for free text: the one rule set behind every stored copy of a prompt.
 *
 * Why: the Worker brief and the debug trace both keep full text (ticket bodies, memory,
 *   tool inputs) that the owner can read or share. A token that rode into that text must
 *   not survive. Known credential shapes (GitHub and API key prefixes, bearer text, session
 *   cookies, PEM blocks) and caller-supplied secret values are blanked here, in one place,
 *   so the trace and the run-event store cannot drift apart.
 *
 * Exports: REDACTED, scrubSecrets().
 * Depends on: nothing. No IO.
 */

export const REDACTED = '[redacted]';

const PATTERNS: readonly RegExp[] = [
  /-----BEGIN [A-Z0-9 ]+-----[\s\S]*?(?:-----END [A-Z0-9 ]+-----|$)/g,
  /\bgh[pousr]_[A-Za-z0-9]{8,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{8,}/g,
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{8,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\bforge_session=[A-Za-z0-9_-]+/g,
];

/** `text` with every exact secret value (longest first, as the caller sorts) and known key shape replaced. */
export function scrubSecrets(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of [...secrets].sort((a, b) => b.length - a.length)) {
    if (secret.length > 0 && out.includes(secret)) {
      out = out.split(secret).join(REDACTED);
    }
  }

  for (const pattern of PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }

  return out;
}
