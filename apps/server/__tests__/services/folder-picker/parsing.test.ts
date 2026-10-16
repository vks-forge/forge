/**
 * Reading what each OS folder program printed: path cleanup and exit codes per platform.
 *
 * Why: the folder window is a child program, and the page trusts one shape back. Each OS
 *   ends its answer differently (newline, trailing slash, BOM) and reports "cancelled"
 *   differently (exit 1, AppleScript -128). Getting that wrong would register a path with a
 *   stray slash, or treat a closed window as an error and open the fallback needlessly.
 *
 * Pins: trailing newline and slash trimmed, roots (`C:\`, `/`) kept; empty output is cancelled;
 *   macOS "User canceled" and zenity exit 1 are cancelled; a missing program is unavailable
 *   (Windows, macOS) or tries the next tool (Linux); a timeout is cancelled; an error exit is
 *   unavailable with the first error line.
 * Depends on: src/services/folder-picker/*. No IO.
 */

import { describe, expect, it } from 'vitest';
import { cleanPath } from '#/services/folder-picker/clean-path.js';
import { parseMacResult } from '#/services/folder-picker/darwin.js';
import { parseLinuxResult } from '#/services/folder-picker/linux.js';
import { parseWindowsResult } from '#/services/folder-picker/win32.js';
import type { CommandResult } from '#/types/folder-picker.types.js';

const result = (over: Partial<CommandResult>): CommandResult => ({
  code: 0,
  stdout: '',
  stderr: '',
  missing: false,
  timedOut: false,
  ...over,
});

describe('cleanPath', () => {
  it.each([
    ['C:\\code\\app\r\n', 'C:\\code\\app'],
    ['\uFEFFC:\\code\\app', 'C:\\code\\app'],
    ['/Users/me/app/\n', '/Users/me/app'],
    ['C:\\', 'C:\\'],
    ['C:', 'C:\\'],
    ['/', '/'],
    ['\\\\server\\share\\', '\\\\server\\share'],
    ['\n', ''],
  ])('%j becomes %j', (raw, expected) => {
    expect(cleanPath(raw)).toBe(expected);
  });
});

describe('parseWindowsResult', () => {
  it('picks the printed folder', () => {
    expect(parseWindowsResult(result({ stdout: 'D:\\repo\r\n' }))).toEqual({
      status: 'picked',
      path: 'D:\\repo',
    });
  });

  it('treats empty output as cancelled', () => {
    expect(parseWindowsResult(result({}))).toEqual({ status: 'cancelled' });
  });

  it('treats a timeout as cancelled', () => {
    expect(parseWindowsResult(result({ code: null, timedOut: true }))).toEqual({
      status: 'cancelled',
    });
  });

  it('reports a failing script as unavailable with its first error line', () => {
    expect(parseWindowsResult(result({ code: 1, stderr: '\r\nboom\r\nmore' }))).toEqual({
      status: 'unavailable',
      reason: 'boom',
    });
  });

  it('reports a missing PowerShell as unavailable', () => {
    expect(parseWindowsResult(result({ code: null, missing: true })).status).toBe(
      'unavailable',
    );
  });
});

describe('parseMacResult', () => {
  it('picks the folder and drops the trailing slash', () => {
    expect(parseMacResult(result({ stdout: '/Users/me/app/\n' }))).toEqual({
      status: 'picked',
      path: '/Users/me/app',
    });
  });

  it('treats exit 1 with User canceled as cancelled', () => {
    expect(
      parseMacResult(
        result({ code: 1, stderr: '0:30: execution error: User canceled. (-128)' }),
      ),
    ).toEqual({ status: 'cancelled' });
  });

  it('treats any other failure as unavailable', () => {
    expect(parseMacResult(result({ code: 1, stderr: 'not allowed' })).status).toBe(
      'unavailable',
    );
  });
});

describe('parseLinuxResult', () => {
  it('picks the folder', () => {
    expect(parseLinuxResult(result({ stdout: '/home/me/app\n' }))).toEqual({
      status: 'picked',
      path: '/home/me/app',
    });
  });

  it('treats exit 1 as cancelled', () => {
    expect(parseLinuxResult(result({ code: 1 }))).toEqual({ status: 'cancelled' });
  });

  it('treats exit 1 with a display error as unavailable', () => {
    expect(
      parseLinuxResult(result({ code: 1, stderr: 'cannot open display:' })),
    ).toMatchObject({ status: 'unavailable' });
  });

  it('returns nothing for a missing program so the next tool is tried', () => {
    expect(parseLinuxResult(result({ code: null, missing: true }))).toBeUndefined();
  });
});
