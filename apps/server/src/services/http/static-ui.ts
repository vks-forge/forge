/**
 * Serves the built control room (`apps/web/dist/web`) from the Forge server.
 *
 * Why: `forge start` must leave the user with one URL that shows the UI, and the page and the
 *   API must share an origin so the session cookie works and no CORS header is ever needed.
 *   The files are read from a fixed folder, so the only way out of it is the request path:
 *   it is decoded once, and anything with a dot segment, a backslash, a colon (Windows drive
 *   and stream syntax) or a NUL byte is refused, then the resolved path must still sit under
 *   the root. Hashed bundle files under `/assets/` are cached for a year (their name changes
 *   when their content does); `index.html` is never cached, so a new build is seen at once.
 *   Every response carries the page security headers. A path with no file and no extension is
 *   a client-side route and gets `index.html`; a missing file with an extension is a real 404.
 *
 * Exports: createStaticUi(), contentTypeOf(), inlineScriptHashes().
 * Depends on: node:crypto, node:fs/promises, node:http, node:path, services/http/http-errors,
 *   services/http/security-headers, types/http. IO: reads files under the UI root.
 */

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { HttpError } from '#/services/http/http-errors.js';
import {
  PAGE_SECURITY_HEADERS,
  contentSecurityPolicy,
} from '#/services/http/security-headers.js';
import type { StaticUi } from '#/types/http.types.js';

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

/** The content type for a file name; anything unknown is an opaque download, never sniffed. */
export function contentTypeOf(path: string): string {
  return TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

/** `sha256-...` CSP sources for every inline `<script>` (one with no `src`) in `html`. */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const match of html.matchAll(
    /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    const body = match[1] ?? '';
    if (body.trim() !== '') {
      hashes.push(`sha256-${createHash('sha256').update(body).digest('base64')}`);
    }
  }

  return hashes;
}

/** Path segments of a request path, or undefined when it could leave the root. */
function safeSegments(pathname: string): string[] | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }

  if (/[\0\\:]/.test(decoded)) {
    return undefined;
  }

  const segments = decoded.split('/').slice(1);
  const bad = segments.some((part) => part === '' || part === '.' || part === '..');

  return bad ? undefined : segments;
}

function send(
  req: IncomingMessage,
  res: ServerResponse,
  body: Buffer,
  headers: Record<string, string>,
): void {
  res.writeHead(200, {
    ...PAGE_SECURITY_HEADERS,
    ...headers,
    'content-length': body.length,
  });

  res.end(req.method === 'HEAD' ? undefined : body);
}

/** Serves the UI built into `root`. Nothing is read until a request arrives. */
export function createStaticUi(root: string): StaticUi {
  const base = resolve(root);

  const serveIndex: StaticUi['serveIndex'] = async (req, res) => {
    let html: Buffer;
    try {
      html = await readFile(resolve(base, 'index.html'));
    } catch {
      throw new HttpError(404, 'ui_missing', 'the web UI is not built');
    }

    send(req, res, html, {
      'content-type': TYPES['.html'] ?? 'text/html',
      'cache-control': 'no-store',
      'content-security-policy': contentSecurityPolicy(
        inlineScriptHashes(html.toString('utf8')),
      ),
    });
  };

  return {
    serveIndex,
    async serveFile(req, res, pathname) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return false;
      }

      if (pathname === '/' || pathname === '/index.html') {
        await serveIndex(req, res);

        return true;
      }

      const segments = safeSegments(pathname);
      if (!segments) {
        return false;
      }

      const file = resolve(base, ...segments);
      if (!file.startsWith(base + sep)) {
        return false;
      }

      try {
        if (!(await stat(file)).isFile()) {
          return false;
        }

        send(req, res, await readFile(file), {
          'content-type': contentTypeOf(file),
          'cache-control':
            segments[0] === 'assets' ? 'public, max-age=31536000, immutable' : 'no-cache',
          'content-security-policy': contentSecurityPolicy(),
        });

        return true;
      } catch {
        return false;
      }
    },
  };
}
