/**
 * Pins the address classifier behind the SSRF guard.
 *
 * Why: `web_fetch` is the only egress a Worker has. If any private, loopback,
 *   link-local or metadata address (including IPv4 hidden inside IPv6) is classified as
 *   public, a prompt-injected page can make the Forge host read its own services or
 *   cloud credentials. These cases are the ranges that matter on a dev box.
 *
 * Pins: isBlockedAddress(), isLoopbackAddress().
 * Depends on: shared/ip-guard.
 */

import { describe, expect, it } from 'vitest';
import { isBlockedAddress, isLoopbackAddress } from '#/shared/ip-guard.js';

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1',
    '127.255.255.254',
    '10.0.0.1',
    '172.16.5.5',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:10.0.0.1',
    '64:ff9b::7f00:1',
    '2001:db8::1',
  ])('blocks %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '93.184.216.34', '172.15.0.1', '172.32.0.1', '2606:4700::1111'])(
    'allows public %s',
    (ip) => {
      expect(isBlockedAddress(ip)).toBe(false);
    },
  );

  it('treats a non-IP string as blocked (fail closed)', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true);
  });
});

describe('isLoopbackAddress', () => {
  it('accepts 127/8 and ::1 only', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('127.9.9.9')).toBe(true);
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('10.0.0.1')).toBe(false);
    expect(isLoopbackAddress('8.8.8.8')).toBe(false);
  });
});
