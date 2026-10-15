/**
 * The security headers every page of the control room is served with.
 *
 * Why: the page talks to a service that can start Workers, so a script injected into it (a
 *   compromised dependency, a hostile Worker output rendered as text) is the worst case. The
 *   policy lets the page run only its own bundle, load only its own fonts and images, talk
 *   only to this server, never be framed (clickjacking), never leak its URL in a `Referer`,
 *   and never have a file sniffed into another type. One inline script is allowed, by hash:
 *   the few lines in `index.html` that apply the saved theme before first paint. The hash is
 *   taken from the built file, so editing that script cannot silently break the page, and
 *   no other inline script is ever allowed. Styles allow inline because the component
 *   library injects `<style>` elements at runtime; scripts are the part that matters.
 *
 * Exports: contentSecurityPolicy(), PAGE_SECURITY_HEADERS.
 * Depends on: none. No IO.
 */

/** The CSP for the page; `scriptHashes` are `sha256-...` sources of the inline scripts it ships. */
export function contentSecurityPolicy(scriptHashes: readonly string[] = []): string {
  const scripts = ["'self'", ...scriptHashes.map((hash) => `'${hash}'`)];

  return [
    "default-src 'none'",
    `script-src ${scripts.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; ');
}

/** Headers for every UI response besides the CSP. */
export const PAGE_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};
