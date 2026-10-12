/**
 * SSRF-guarded text fetch.
 *
 * Why: `web_fetch` is the only egress a Worker has, and the pages it reads can be
 *   written by attackers. Each hop (the first URL and every redirect) is parsed, checked
 *   against the allow-list, resolved, and refused if ANY address is private, loopback or
 *   link-local; the socket is then opened to the validated address so a DNS answer that
 *   changes afterwards (rebinding) cannot redirect it. Redirects are followed manually
 *   (max 5), the body is capped and the whole call is time-boxed, so a hostile server
 *   can neither pivot inward nor exhaust memory (tool-system.md §9).
 *
 * Exports: guardedFetchText(), MAX_REDIRECTS.
 * Depends on: @forge/core, node:net, shared/ip-guard, shared/html-text, types/deps.types. IO via injected transport.
 */

import { isIP } from 'node:net';
import { InvalidInputError, PolicyDeniedError } from '@forge/core';
import { htmlToText } from '#/shared/html-text.js';
import { isBlockedAddress } from '#/shared/ip-guard.js';
import type { FetchedText, GuardOptions } from '#/types/ssrf.types.js';

export const MAX_REDIRECTS = 5;

const TEXT_TYPE =
  /^(text\/|application\/(json|xml|xhtml\+xml|[a-z.+-]*\+(json|xml))|application\/javascript)/i;

function bareHost(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

async function validateHop(
  url: URL,
  o: GuardOptions,
): Promise<{ address: string; family: 4 | 6 }> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new InvalidInputError(`scheme not allowed: ${url.protocol}`);
  if (url.username || url.password)
    throw new InvalidInputError('URLs with embedded credentials are not allowed');
  const host = bareHost(url);
  if (o.allowHosts.length > 0 && !o.allowHosts.includes(host))
    throw new PolicyDeniedError(`host not in the fetch allow-list: ${host}`);
  if (host === 'localhost' || host.endsWith('.localhost'))
    throw new PolicyDeniedError(`blocked: ${host} is a loopback name`);
  const literal = isIP(host);
  const addresses = literal ? [host] : await o.resolve(host);
  if (addresses.length === 0) throw new InvalidInputError(`could not resolve ${host}`);
  // Any private answer poisons the name: an attacker mixes public and private records.
  if (addresses.some(isBlockedAddress))
    throw new PolicyDeniedError(
      `blocked: ${host} resolves to a private or loopback address`,
    );
  const address = addresses[0] as string;
  return { address, family: isIP(address) === 6 ? 6 : 4 };
}

async function readCapped(
  body: AsyncIterable<Uint8Array> & { destroy(): unknown },
  max: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for await (const chunk of body) {
    const room = max - total;
    if (chunk.length > room) {
      chunks.push(chunk.subarray(0, room));
      total += room;
      truncated = true;
      break;
    }
    chunks.push(chunk);
    total += chunk.length;
  }
  if (truncated) body.destroy();
  return { bytes: Buffer.concat(chunks), truncated };
}

/** Fetches `rawUrl` as text under the guard; throws ForgeErrors on any refusal. */
export async function guardedFetchText(
  rawUrl: string,
  o: GuardOptions,
): Promise<FetchedText> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), o.timeoutMs);
  try {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new InvalidInputError('invalid URL');
    }
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const target = await validateHop(url, o);
      const res = await o.transport({ url, ...target, signal: ctl.signal });
      if (res.status >= 300 && res.status < 400 && res.headers['location']) {
        res.body.destroy();
        try {
          url = new URL(res.headers['location'], url);
        } catch {
          throw new InvalidInputError('invalid redirect target');
        }
        continue;
      }
      if (res.status < 200 || res.status >= 300) {
        res.body.destroy();
        throw new InvalidInputError(`fetch failed: HTTP ${res.status}`);
      }
      const type = res.headers['content-type'] ?? 'text/plain';
      if (!TEXT_TYPE.test(type)) {
        res.body.destroy();
        throw new InvalidInputError(`unsupported content type: ${type.split(';')[0]}`);
      }
      const { bytes, truncated } = await readCapped(res.body, o.maxBytes);
      const raw = new TextDecoder().decode(bytes);
      const isHtml = /html/i.test(type);
      return { text: isHtml ? htmlToText(raw) : raw, finalUrl: url.href, truncated };
    }
    throw new InvalidInputError(`too many redirects (more than ${MAX_REDIRECTS})`);
  } catch (err) {
    if (ctl.signal.aborted) throw new InvalidInputError('fetch timed out');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
