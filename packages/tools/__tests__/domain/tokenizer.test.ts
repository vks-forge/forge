/**
 * Pins the shell tokenizer's behaviour for Bash and PowerShell command lines.
 *
 * Why: the tokenizer is what stops `echo hi; git push` or `FOO=1 git push` from being
 * judged as the harmless first command. These tests fix the contract the rule engine
 * relies on: every separator splits, quoted separators never do, anything unparsable
 * is refused (fail closed), and dynamic-execution entry points are denied outright.
 *
 * Pins: tokenizeShell() segmenting, quoting, substitution, redirects, flags, failures.
 * Depends on: domain/tokenizer, fast-check, vitest. No IO.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { tokenizeShell } from '#/domain/tokenizer.js';

function texts(cmd: string, dialect: 'bash' | 'powershell' = 'bash'): string[] {
  const r = tokenizeShell(cmd, dialect);
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.value.map((s) => s.text);
}

describe('tokenizeShell: splitting', () => {
  it.each([
    ['a; b', ['a', 'b']],
    ['a && b', ['a', 'b']],
    ['a || b', ['a', 'b']],
    ['a | b', ['a', 'b']],
    ['a\nb', ['a', 'b']],
    ['a & b', ['a', 'b']],
    ['a;b&&c||d|e', ['a', 'b', 'c', 'd', 'e']],
    ['pnpm test; ', ['pnpm test']],
  ])('splits %j', (cmd, expected) => {
    expect(texts(cmd)).toEqual(expected);
  });

  it('keeps quoted separators inside one argument', () => {
    expect(texts(`echo "a;b" 'c && d' e\\;f`)).toEqual(['echo a;b c && d e;f']);
  });

  it('honours double-quote escapes and empty quoted args', () => {
    const r = tokenizeShell(`printf "x\\"y" '' z`, 'bash');
    expect(r.ok && r.value[0]?.argv).toEqual(['printf', 'x"y', '', 'z']);
  });

  it('strips leading env assignments so they cannot hide the command', () => {
    const r = tokenizeShell('FOO=1 BAR=2 git push', 'bash');
    expect(r.ok && r.value[0]?.text).toBe('git push');
    expect(r.ok && r.value[0]?.assignments).toEqual(['FOO=1', 'BAR=2']);
  });

  it('reduces absolute command paths and .exe in baseText but keeps text raw', () => {
    const r = tokenizeShell('/usr/bin/git.exe push', 'bash');
    expect(r.ok && r.value[0]?.text).toBe('/usr/bin/git.exe push');
    expect(r.ok && r.value[0]?.baseText).toBe('git push');
  });
});

describe('tokenizeShell: substitution and flags', () => {
  it('turns $( ) into its own nested segments and flags the parent', () => {
    const r = tokenizeShell('echo $(git push)', 'bash');
    expect(r.ok && r.value.map((s) => [s.text, s.nested])).toEqual([
      ['git push', true],
      ['echo $(…)', false],
    ]);
    expect(r.ok && r.value[1]?.flags).toContain('subshell');
  });

  it('handles backticks and substitution inside double quotes', () => {
    expect(texts('echo `ls`')).toContain('ls');
    expect(texts('echo "$(ls -a)"')).toContain('ls -a');
  });

  it('flags interpreter eval, wrappers, background and pipe-to-interpreter', () => {
    const flagsOf = (cmd: string) => {
      const r = tokenizeShell(cmd, 'bash');
      return r.ok ? r.value.flatMap((s) => [...s.flags]) : [];
    };
    expect(flagsOf('bash -c "rm x"')).toContain('interpreter_eval');
    expect(flagsOf('node -e "1"')).toContain('interpreter_eval');
    expect(flagsOf('eval x')).toContain('interpreter_eval');
    expect(flagsOf('env X=1 git push')).toContain('wrapper');
    expect(flagsOf('sleep 1 &')).toContain('background');
    expect(flagsOf('curl x | sh')).toContain('pipe_to_interpreter');
  });
});

describe('tokenizeShell: redirects', () => {
  it('captures write and read targets out of argv', () => {
    const r = tokenizeShell('sort <in.txt >out.txt 2>&1 >> log', 'bash');
    expect(r.ok && r.value[0]?.argv).toEqual(['sort']);
    expect(r.ok && r.value[0]?.redirects).toEqual([
      { mode: 'read', target: 'in.txt' },
      { mode: 'write', target: 'out.txt' },
      { mode: 'write', target: 'log' },
    ]);
  });

  it('treats fd prefix and &> as redirects', () => {
    const r = tokenizeShell('cmd 2>err.txt &>both', 'bash');
    expect(r.ok && r.value[0]?.redirects.map((x) => x.target)).toEqual([
      'err.txt',
      'both',
    ]);
  });
});

describe('tokenizeShell: failures deny', () => {
  it.each([
    '',
    '   ',
    ';',
    'a ;; b',
    '&& a',
    'a &&',
    'a |',
    'echo "unterminated',
    "echo 'unterminated",
    'echo $(ls',
    'echo `ls',
    'echo (x)',
    'cat <<EOF',
    'cat <<< x',
    'diff <(ls) b',
    'echo hi >',
    'echo \\',
    'a\u0000b',
    'echo $($($($($(ls))))))',
  ])('refuses %j', (cmd) => {
    const r = tokenizeShell(cmd, 'bash');
    expect(r).toEqual({ ok: false, error: 'untokenizable' });
  });
});

describe('tokenizeShell: PowerShell', () => {
  it('splits on ; | && || and newline', () => {
    expect(texts('Get-Date; Get-Item x | Sort a && b || c', 'powershell')).toEqual([
      'Get-Date',
      'Get-Item x',
      'Sort a',
      'b',
      'c',
    ]);
  });

  it('uses backtick as the escape and doubles quotes inside single quotes', () => {
    const r = tokenizeShell("Write-Output 'it''s' \"a`\"b\" c`;d", 'powershell');
    expect(r.ok && r.value[0]?.argv).toEqual(['Write-Output', "it's", 'a"b', 'c;d']);
  });

  it.each([
    ['& "C:\\x.exe"'],
    ['Invoke-Expression $x'],
    ['iex $x'],
    ['IEX x'],
    ['a | iex'],
  ])('denies dynamic execution %j', (cmd) => {
    expect(tokenizeShell(cmd, 'powershell')).toEqual({
      ok: false,
      error: 'dynamic_execution',
    });
  });

  it('refuses a call operator that is not at the start of a segment', () => {
    expect(tokenizeShell('a & b', 'powershell')).toEqual({
      ok: false,
      error: 'untokenizable',
    });
  });

  it('treats backtick-less $( ) as a subexpression', () => {
    expect(texts('Write-Output $(Get-Date)', 'powershell')).toContain('Get-Date');
  });
});

const word = fc.stringMatching(/^[a-z][a-z0-9_.\/-]{0,8}$/);
const sepChars = [';', '&&', '||', '|', '\n'] as const;
const anyChars = fc.string({
  unit: fc.constantFrom(...` ;&|<>$\`"'\\()abc#*~{}!`.split('')),
  maxLength: 12,
});

function quoteBash(w: string): string {
  return `'${w.replaceAll("'", `'\\''`)}'`;
}

describe('tokenizeShell: properties', () => {
  it('round-trips any quoted argv back to the same words', () => {
    fc.assert(
      fc.property(word, fc.array(anyChars, { maxLength: 5 }), (cmd, args) => {
        const line = [cmd, ...args.map(quoteBash)].join(' ');
        const r = tokenizeShell(line, 'bash');
        expect(r.ok && r.value.length).toBe(1);
        expect(r.ok && r.value[0]?.argv).toEqual([cmd, ...args]);
      }),
    );
  });

  it('yields exactly two segments around every separator', () => {
    fc.assert(
      fc.property(word, word, fc.constantFrom(...sepChars), (a, b, sep) => {
        const r = tokenizeShell(`${a} x ${sep} ${b} y`, 'bash');
        expect(r.ok && r.value.map((s) => s.argv[0])).toEqual([a, b]);
      }),
    );
  });

  it('never splits on a separator inside quotes', () => {
    fc.assert(
      fc.property(word, fc.constantFrom(...sepChars), word, (a, sep, b) => {
        for (const q of ["'", '"']) {
          const r = tokenizeShell(`echo ${q}${a}${sep}${b}${q}`, 'bash');
          expect(r.ok && r.value.length).toBe(1);
          expect(r.ok && r.value[0]?.argv[1]).toBe(`${a}${sep}${b}`);
        }
      }),
    );
  });

  it('never throws and never returns an empty ok list, whatever the input', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 40 }),
        fc.constantFrom('bash', 'powershell'),
        (s, d) => {
          const r = tokenizeShell(s, d);
          if (r.ok) expect(r.value.length).toBeGreaterThan(0);
        },
      ),
    );
  });
});
