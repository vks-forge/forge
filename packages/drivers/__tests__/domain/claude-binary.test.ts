/**
 * Pins: how the `claude` binary is resolved before anything is spawned.
 *
 * Why: the driver never uses a shell, so on Windows a `claude.cmd` shim cannot start. The
 * server must stop at startup with a line that says what to set, not crash a Director step
 * later. Off Windows nothing is checked.
 *
 * Depends on: src/domain/claude-binary. No IO (existence is injected).
 */

import { InvalidInputError } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  resolveClaudeBinary,
  resolveInstalledClaude,
  toForwardSlashes,
} from '#/domain/claude-binary.js';
import { HarnessNotInstalledError } from '#/shared/errors.js';

const BIN = String.raw`C:\bin`;
const NPM = String.raw`C:\npm`;
const TOOLS = String.raw`C:\tools`;

const on = (files: string[], platform: NodeJS.Platform = 'win32') => ({
  platform,
  pathVar: `${BIN};${NPM}`,
  exists: (p: string) => files.includes(p),
});

describe('resolveClaudeBinary', () => {
  it('returns the name unchanged off Windows', () => {
    expect(resolveClaudeBinary('claude', on([], 'linux'))).toBe('claude');
  });

  it('finds claude.exe on PATH', () => {
    const exe = String.raw`C:\npm\claude.exe`;

    expect(resolveClaudeBinary('claude', on([exe]))).toBe(exe);
  });

  it('accepts an explicit .exe path', () => {
    const exe = `${TOOLS}\\claude.exe`;

    expect(resolveClaudeBinary(exe, on([exe]))).toBe(exe);
  });

  it('refuses a .cmd shim with the variable to set', () => {
    expect(() => resolveClaudeBinary('claude', on([`${NPM}\\claude.cmd`]))).toThrow(
      /script shim.*FORGE_CLAUDE_BINARY/,
    );
  });

  it('prefers a real exe over a shim in an earlier directory', () => {
    const files = [`${BIN}\\claude.cmd`, `${NPM}\\claude.exe`];

    expect(resolveClaudeBinary('claude', on(files))).toBe(`${NPM}\\claude.exe`);
  });

  it('reports a missing binary as invalid input', () => {
    expect(() => resolveClaudeBinary('claude', on([]))).toThrow(InvalidInputError);
    expect(() => resolveClaudeBinary('claude', on([]))).toThrow(/not found on PATH/);
  });
});

describe('resolveInstalledClaude (the path the ACP adapter is given)', () => {
  const posix = (files: string[]) => ({
    platform: 'linux' as const,
    pathVar: '/usr/local/bin:/home/me/.local/bin',
    exists: (p: string) => files.includes(p),
  });

  it('finds claude on a POSIX PATH as an absolute path', () => {
    expect(resolveInstalledClaude('claude', posix(['/home/me/.local/bin/claude']))).toBe(
      '/home/me/.local/bin/claude',
    );
  });

  it('uses an explicit path as given when it exists', () => {
    expect(resolveInstalledClaude('/opt/claude', posix(['/opt/claude']))).toBe(
      '/opt/claude',
    );
  });

  it('follows the Windows rules on win32', () => {
    const exe = String.raw`C:\npm\claude.exe`;

    expect(resolveInstalledClaude('claude', on([exe]))).toBe(exe);
  });

  it('a missing install is a typed error that names the install page, on every platform', () => {
    const msg = 'Install Claude Code: https://code.claude.com/docs/en/setup';

    expect(() => resolveInstalledClaude('claude', posix([]))).toThrow(
      HarnessNotInstalledError,
    );

    expect(() => resolveInstalledClaude('claude', posix([]))).toThrow(msg);
    expect(() => resolveInstalledClaude('claude', on([]))).toThrow(msg);
    expect(() => resolveInstalledClaude('/opt/claude', posix([]))).toThrow(
      InvalidInputError,
    );
  });

  it('writes a Windows path with forward slashes', () => {
    expect(toForwardSlashes(String.raw`C:\Users\me\.local\bin\claude.exe`)).toBe(
      'C:/Users/me/.local/bin/claude.exe',
    );
  });
});
