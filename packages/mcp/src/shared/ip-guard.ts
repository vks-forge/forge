/**
 * IP address classifier for the SSRF guard.
 *
 * Why: `web_fetch` must never reach the Forge host's own services, the LAN or cloud
 *   metadata. Attackers hide those targets behind IPv6 forms (`::ffff:7f00:1`), NAT64
 *   prefixes and numeric host spellings, so classification works on the parsed bytes of
 *   the address, not on its text, and anything unparsable is treated as blocked.
 *
 * Exports: isBlockedAddress(), isLoopbackAddress().
 * Depends on: node:net. No IO.
 */

import { BlockList, isIP } from 'node:net';

const V4_BLOCKED: readonly [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

const V6_BLOCKED: readonly [string, number][] = [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
];

const blocked = new BlockList();
for (const [net, prefix] of V4_BLOCKED) {
  blocked.addSubnet(net, prefix, 'ipv4');
}

for (const [net, prefix] of V6_BLOCKED) {
  blocked.addSubnet(net, prefix, 'ipv6');
}

/** Expands an IPv6 text address to 16 bytes, or null when malformed. */
function v6Bytes(ip: string): number[] | null {
  let text = ip.split('%')[0] ?? ip;
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted) {
    const parts = (dotted[1] as string).split('.').map(Number);
    if (parts.some((p) => p > 255)) {
      return null;
    }

    const hi = ((parts[0] as number) << 8) | (parts[1] as number);
    const lo = ((parts[2] as number) << 8) | (parts[3] as number);
    text = text.slice(0, dotted.index) + `${hi.toString(16)}:${lo.toString(16)}`;
  }

  const halves = text.split('::');
  if (halves.length > 2) {
    return null;
  }

  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 0) {
    return null;
  }

  const groups = [
    ...head,
    ...Array<string>(halves.length === 2 ? missing : 0).fill('0'),
    ...tail,
  ];

  if (groups.length !== 8) {
    return null;
  }

  const bytes: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) {
      return null;
    }

    const n = parseInt(g, 16);
    bytes.push(n >> 8, n & 255);
  }

  return bytes;
}

/** IPv4 embedded in an IPv6 address (`::ffff:a.b.c.d` mapped or `64:ff9b::/96` NAT64), if any. */
function embeddedV4(bytes: number[]): string | null {
  const zeros = (from: number, to: number) => bytes.slice(from, to).every((b) => b === 0);
  const mapped = zeros(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff;
  const nat64 =
    bytes[0] === 0 &&
    bytes[1] === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b &&
    zeros(4, 12);

  return mapped || nat64 ? bytes.slice(12).join('.') : null;
}

/** True when `ip` is private, loopback, link-local, multicast, reserved or not a valid IP. */
export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    return blocked.check(ip, 'ipv4');
  }

  if (family === 6) {
    const bytes = v6Bytes(ip);
    if (!bytes) {
      return true;
    }

    const v4 = embeddedV4(bytes);
    if (v4) {
      return blocked.check(v4, 'ipv4');
    }

    return blocked.check(ip, 'ipv6');
  }

  return true;
}

/** True for 127.0.0.0/8 and ::1 (also IPv4-mapped loopback). */
export function isLoopbackAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    return ip.startsWith('127.');
  }

  if (family === 6) {
    const bytes = v6Bytes(ip);
    if (!bytes) {
      return false;
    }

    const v4 = embeddedV4(bytes);
    if (v4) {
      return v4.startsWith('127.');
    }

    return bytes.slice(0, 15).every((b) => b === 0) && bytes[15] === 1;
  }

  return false;
}
