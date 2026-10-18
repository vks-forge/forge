/**
 * Pins how `forge memory ...` is parsed, and that its options belong to it alone.
 *
 * Why: argv is untrusted input at the process boundary. The memory commands take a few options of their own
 *   (kinds, status, tags, a count, `--json`, `--all`, `--full`, `--dir`); an unknown word, a count out of range or
 *   a memory option on another command must be a usage error, not a command that quietly does something else.
 *   Defaults matter too: a search is for active decisions and rejected approaches, eight hits, as text.
 *
 * Pins: search, get and related shapes with their defaults and options, comma lists and repeated tags, the
 *   usage errors (missing words, unknown kind or status, bad count, memory options elsewhere), and that the
 *   older commands still parse.
 * Depends on: src/services/parse-args, @forge/core, vitest. No IO.
 */

import { InvalidInputError } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { parseCommand } from '#/services/parse-args.js';

describe('forge memory search', () => {
  it('takes the words after search and defaults to eight hits as text', () => {
    expect(parseCommand(['memory', 'search', 'tdd', 'red', 'green'])).toEqual({
      kind: 'memory-search',
      words: ['tdd', 'red', 'green'],
      kinds: undefined,
      status: undefined,
      tags: [],
      k: 8,
      all: false,
      json: false,
      dir: undefined,
    });
  });

  it('reads kinds and statuses as comma lists, repeated tags, a count, and the switches', () => {
    expect(
      parseCommand([
        'memory',
        'search',
        'wal',
        '--kind',
        'decision,rejected',
        '--status',
        'active',
        '--tag',
        'db',
        '--tag',
        'api',
        '-k',
        '3',
        '--json',
        '--all',
        '--dir',
        'some/folder',
      ]),
    ).toMatchObject({
      kind: 'memory-search',
      words: ['wal'],
      kinds: ['decision', 'rejected'],
      status: ['active'],
      tags: ['db', 'api'],
      k: 3,
      all: true,
      json: true,
      dir: 'some/folder',
    });
  });

  it.each([
    [['memory', 'search']],
    [['memory', 'search', 'x', '--kind', 'note']],
    [['memory', 'search', 'x', '--status', 'maybe']],
    [['memory', 'search', 'x', '-k', '0']],
    [['memory', 'search', 'x', '-k', '26']],
    [['memory', 'search', 'x', '-k', 'many']],
    [['memory']],
    [['memory', 'forget', 'd-0001']],
  ])('refuses %j as a usage error', (argv) => {
    expect(() => parseCommand(argv)).toThrow(InvalidInputError);
  });
});

describe('forge memory get and related', () => {
  it('takes one or more ids and --full', () => {
    expect(parseCommand(['memory', 'get', 'd-0001', 'd-0002', '--full'])).toEqual({
      kind: 'memory-get',
      ids: ['d-0001', 'd-0002'],
      full: true,
      json: false,
      dir: undefined,
    });
  });

  it('takes exactly one id for related', () => {
    expect(parseCommand(['memory', 'related', 'd-0015', '--json'])).toEqual({
      kind: 'memory-related',
      id: 'd-0015',
      json: true,
      dir: undefined,
    });

    expect(() => parseCommand(['memory', 'related'])).toThrow(InvalidInputError);
    expect(() => parseCommand(['memory', 'related', 'd-0001', 'd-0002'])).toThrow(
      InvalidInputError,
    );

    expect(() => parseCommand(['memory', 'get'])).toThrow(InvalidInputError);
  });
});

describe('the other commands', () => {
  it('still parse, and refuse a memory option', () => {
    expect(parseCommand(['start', '--no-open'])).toEqual({ kind: 'start', open: false });
    expect(parseCommand(['status'])).toEqual({ kind: 'status' });
    expect(parseCommand(['secret', 'wrap', 'n', 'f'])).toEqual({
      kind: 'secret-wrap',
      name: 'n',
      file: 'f',
    });

    expect(parseCommand([])).toEqual({ kind: 'help' });

    for (const argv of [
      ['status', '--json'],
      ['start', '--tag', 'x'],
      ['stop', '-k', '3'],
      ['secret', 'wrap', 'n', 'f', '--dir', 'x'],
    ]) {
      expect(() => parseCommand(argv)).toThrow(InvalidInputError);
    }
  });
});
