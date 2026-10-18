/**
 * IP literal check — is a URL host an address that must never be fetched?
 *
 * Why: a URL whose host is an IP literal skips DNS, so the DNS-pinned guard of the fetcher never sees a
 *   name. Admission therefore refuses the literal itself when it is loopback, private, link-local,
 *   carrier-grade NAT, multicast or reserved, for IPv4 and for IPv6, including IPv4 embedded in a
 *   mapped or NAT64 IPv6 address. The URL parser has already turned decimal, octal and hex IPv4
 *   spellings into dotted form, so only canonical text reaches here. A name is not judged here.
 *
 * Exports: isPrivateLiteral().
 * Depends on: node:net. No IO.
 */

import { isIP } from 'node:net';

function v4Private(a: number, b: number): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

/** The eight 16-bit groups of an IPv6 literal (embedded dotted IPv4 expanded), or null. */
function groups(host: string): number[] | null {
  let text = host.split('%')[0] ?? host;
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (dotted) {
    const [, a, b, c, d] = dotted.map(Number);
    text = text.replace(
      dotted[0],
      `${(((a as number) << 8) | (b as number)).toString(16)}:${(((c as number) << 8) | (d as number)).toString(16)}`,
    );
  }

  const halves = text.split('::');
  if (halves.length > 2) {
    return null;
  }

  const head = (halves[0] ?? '') === '' ? [] : (halves[0] as string).split(':');
  const tail =
    halves.length === 2 && halves[1] !== '' ? (halves[1] as string).split(':') : [];

  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) {
    return null;
  }

  const all = [...head, ...Array<string>(fill).fill('0'), ...tail].map((g) =>
    Number.parseInt(g, 16),
  );

  return all.length === 8 &&
    all.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff)
    ? all
    : null;
}

function v6Private(host: string): boolean {
  const g = groups(host);
  if (g === null) {
    return true;
  }

  const [g0, g1, g2, g3, g4, g5, g6, g7] = g as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];

  const allZeroTo = (n: number): boolean => g.slice(0, n).every((x) => x === 0);

  if (allZeroTo(7) && (g7 === 0 || g7 === 1)) {
    return true;
  }

  // IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d) and NAT64 (64:ff9b::a.b.c.d).
  const embedded =
    (allZeroTo(5) && (g5 === 0xffff || g5 === 0)) ||
    (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0);

  if (embedded && v4Private(g6 >> 8, g6 & 0xff)) {
    return true;
  }

  return (g0 & 0xfe00) === 0xfc00 || (g0 & 0xffc0) === 0xfe80 || (g0 & 0xff00) === 0xff00;
}

/** True when `host` (no brackets) is an IP literal in a range a fetch must never reach; false for names. */
export function isPrivateLiteral(host: string): boolean {
  const kind = isIP(host);
  if (kind === 4) {
    const [a, b] = host.split('.').map(Number);

    return v4Private(a as number, b as number);
  }

  return kind === 6 ? v6Private(host) : false;
}
