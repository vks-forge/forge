/**
 * The install token file: creation, reuse, repair, and the ACL step.
 *
 * Why: the token is created once per installation and every client depends on reading the
 *   same value back. A restart that minted a new token would lock out a running CLI or
 *   browser; a truncated file that was trusted would make every call fail with no way to
 *   tell why; a token that reached the log would defeat the file permissions; and a failing
 *   `icacls` must warn (without the token) and not stop Forge from starting.
 *
 * Pins: first start writes a 43-char base64url token; second start returns the same one;
 *   a malformed file is replaced; the restrict port runs on every start, including for an
 *   existing token; the Windows adapter grants by SID, parsed from `whoami`; its failure is a
 *   warning that does not contain the token; POSIX mode is 0600; the real Windows ACL adapter
 *   leaves only the current user.
 * Depends on: src/services/auth/{install-token,restrict-file}, helpers/temp. IO: temp files,
 *   `icacls` on Windows.
 */

import { execFileSync } from 'node:child_process';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  INSTALL_TOKEN_PATTERN,
  ensureInstallToken,
} from '#/services/auth/install-token.js';
import { nodeRestrictFile, parseWhoamiSid } from '#/services/auth/restrict-file.js';
import { makeTempDir } from '#tests/helpers/temp.js';

const fresh = (): string => join(makeTempDir('forge-token-'), 'home', 'install-token');

describe('ensureInstallToken', () => {
  it('creates the file with a well-formed token on first start', async () => {
    const path = fresh();
    const restrict = vi.fn(async () => undefined);

    const token = await ensureInstallToken(path, { restrict, log: vi.fn() });

    expect(token).toMatch(INSTALL_TOKEN_PATTERN);
    expect((await readFile(path, 'utf8')).trim()).toBe(token);
    expect(restrict).toHaveBeenCalledExactlyOnceWith(path);
  });

  it('returns the same token on the next start and leaves the file alone', async () => {
    const path = fresh();
    const restrict = vi.fn(async () => undefined);
    const first = await ensureInstallToken(path, { restrict, log: vi.fn() });

    const second = await ensureInstallToken(path, { restrict, log: vi.fn() });

    expect(second).toBe(first);
    expect(await readFile(path, 'utf8')).toBe(`${first}\n`);
  });

  it('restricts an existing token file again on every start', async () => {
    const path = fresh();
    const restrict = vi.fn(async () => undefined);
    await ensureInstallToken(path, { restrict, log: vi.fn() });

    await ensureInstallToken(path, { restrict, log: vi.fn() });
    await ensureInstallToken(path, { restrict, log: vi.fn() });

    expect(restrict).toHaveBeenCalledTimes(3);
  });

  it('replaces a file that does not hold a token', async () => {
    const path = fresh();
    await ensureInstallToken(path, { restrict: async () => undefined, log: vi.fn() });
    await writeFile(path, 'trunc');

    const token = await ensureInstallToken(path, {
      restrict: async () => undefined,
      log: vi.fn(),
    });

    expect(token).toMatch(INSTALL_TOKEN_PATTERN);
    expect((await readFile(path, 'utf8')).trim()).toBe(token);
  });

  it('starts anyway when restricting the file fails, and never logs the token', async () => {
    const path = fresh();
    const log = vi.fn();

    const token = await ensureInstallToken(path, {
      restrict: async () => {
        throw new Error('icacls: access denied');
      },
      log,
    });

    expect(token).toMatch(INSTALL_TOKEN_PATTERN);
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[0]).toBe('warn');
    expect(JSON.stringify(log.mock.calls)).not.toContain(token);
    expect(JSON.stringify(log.mock.calls)).toContain('icacls: access denied');
  });

  it.skipIf(process.platform === 'win32')('is mode 0600 on POSIX', async () => {
    const path = fresh();

    await ensureInstallToken(path, { restrict: nodeRestrictFile(), log: vi.fn() });

    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it.each([
    ['a local account', '"DESKTOP-1\\vikas","S-1-5-21-1-2-3-1001"\r\n'],
    ['an Entra account', '"AzureAD\\Vikash Sharma","S-1-12-1-111-222-333-444"\r\n'],
  ])('reads the SID from the whoami output of %s', (_name, output) => {
    expect(parseWhoamiSid(output)).toMatch(/^S-1-/);
  });

  it('refuses whoami output with no SID', () => {
    expect(() => parseWhoamiSid('INFO: nothing here')).toThrow(/SID/);
  });

  it.skipIf(process.platform !== 'win32')(
    'leaves only the current user on the ACL on Windows',
    async () => {
      const path = fresh();

      await ensureInstallToken(path, { restrict: nodeRestrictFile(), log: vi.fn() });

      const acl = execFileSync('icacls', [path], { encoding: 'utf8' });
      const entries = acl
        .split(/\r?\n/)
        .filter((line) => line.includes(':(') || /:\(.+\)/.test(line));

      expect(acl.toLowerCase()).toContain(userInfo().username.toLowerCase());
      expect(acl).not.toMatch(/BUILTIN\\Users|Everyone|Authenticated Users/);
      expect(entries.length).toBe(1);
    },
  );
});
