/**
 * Simple shell tokenizer for the Bash and PowerShell tools.
 *
 * Why: a Worker sends one string such as `pnpm test && git push` and policy must judge
 *   every command inside it, not the first word. Splitting on `;`, `&&`, `||`, `|`,
 *   newlines, `$(...)` and backticks, honouring quotes, lets each simple command be
 *   matched against rules on its own, and a chain is only as allowed as its worst
 *   segment. Anything this small parser cannot understand (heredocs, unbalanced quotes,
 *   process substitution, PowerShell call operators and `Invoke-Expression`) is refused
 *   rather than guessed at, because a wrong parse is a policy bypass. Tree-sitter would
 *   parse more, but is unverified on Windows (d-0038, d-0048).
 *
 * Exports: tokenizeShell().
 * Depends on: @forge/core (Result), domain/shell-flags, types/tokenizer.types. No IO.
 */

import { err, ok } from '@forge/core';
import type { Result } from '@forge/core';
import { Abort, MAX_DEPTH, bail, buildSegment } from '#/domain/shell-flags.js';
import type {
  ShellDialect,
  ShellFlag,
  ShellRedirect,
  ShellSegment,
  TokenizeFailure,
} from '#/types/tokenizer.types.js';

/**
 * Splits `command` into simple-command segments. Returns `untokenizable` or
 * `dynamic_execution` on anything it cannot represent faithfully; callers must deny.
 */
export function tokenizeShell(
  command: string,
  dialect: ShellDialect,
): Result<ShellSegment[], TokenizeFailure> {
  const src = command.normalize('NFC');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(src))
    return err('untokenizable');
  try {
    const { segments } = parseSeq(src, 0, dialect, 0, false);
    return segments.length === 0 ? err('untokenizable') : ok(segments);
  } catch (e) {
    return err(e instanceof Abort ? e.reason : 'untokenizable');
  }
}

function parseSeq(
  src: string,
  start: number,
  dialect: ShellDialect,
  depth: number,
  inSubst: boolean,
): { segments: ShellSegment[]; next: number } {
  const ps = dialect === 'powershell';
  const out: ShellSegment[] = [];
  let nested: ShellSegment[] = [];
  let words: string[] = [];
  let redirects: ShellRedirect[] = [];
  let flags = new Set<ShellFlag>();
  let cur = '';
  let started = false;
  let pending: 'read' | 'write' | null = null;
  let pipedIn = false;
  let needOperand = false;

  const flushWord = (): void => {
    if (!started) return;
    if (pending) redirects.push({ mode: pending, target: cur });
    else words.push(cur);
    pending = null;
    cur = '';
    started = false;
  };
  const segEmpty = (): boolean =>
    words.length === 0 &&
    !started &&
    redirects.length === 0 &&
    pending === null &&
    nested.length === 0 &&
    flags.size === 0;

  const endSegment = (extra?: ShellFlag): void => {
    flushWord();
    if (pending || words.length === 0) bail();
    out.push(...nested.map((s) => ({ ...s, nested: true })));
    out.push(buildSegment(words, redirects, flags, pipedIn, dialect, extra));
    nested = [];
    words = [];
    redirects = [];
    flags = new Set();
    pipedIn = false;
    needOperand = false;
  };
  const operator = (): void => {
    flushWord();
    if (segEmpty()) bail();
    endSegment();
  };
  const sub = (body: string, from: number, closeParen: boolean): number => {
    if (depth >= MAX_DEPTH) bail();
    const r = parseSeq(body, from, dialect, depth + 1, closeParen);
    nested.push(...r.segments);
    flags.add('subshell');
    cur += '$(…)';
    started = true;
    return r.next;
  };
  /** Backtick substitution (bash). `i` is the opening backtick; returns the index after the closing one. */
  const backtick = (i: number): number => {
    let j = i + 1;
    while (j < src.length && src[j] !== '`') j += src[j] === '\\' ? 2 : 1;
    if (j >= src.length) bail();
    sub(src.slice(i + 1, j).replace(/\\([`\\$])/g, '$1'), 0, false);
    return j + 1;
  };
  const dquote = (i: number): number => {
    let j = i + 1;
    started = true;
    for (;;) {
      const c = src[j];
      if (c === undefined) return bail();
      if (c === '"') {
        if (ps && src[j + 1] === '"') {
          cur += '"';
          j += 2;
          continue;
        }
        return j + 1;
      }
      if (c === '$' && src[j + 1] === '(') {
        j = sub(src, j + 2, true);
        continue;
      }
      if (c === '`' && !ps) {
        j = backtick(j);
        continue;
      }
      if (c === '`' && ps) {
        if (j + 1 >= src.length) bail();
        cur += src[j + 1];
        j += 2;
        continue;
      }
      if (c === '\\' && !ps) {
        const n = src[j + 1];
        if (n !== undefined && '"\\$`'.includes(n)) {
          cur += n;
          j += 2;
          continue;
        }
        if (n === '\n') {
          j += 2;
          continue;
        }
      }
      cur += c;
      j += 1;
    }
  };
  const squote = (i: number): number => {
    let j = i + 1;
    started = true;
    for (;;) {
      const c = src[j];
      if (c === undefined) return bail();
      if (c === "'") {
        if (ps && src[j + 1] === "'") {
          cur += "'";
          j += 2;
          continue;
        }
        return j + 1;
      }
      cur += c;
      j += 1;
    }
  };
  const redirect = (i: number): number => {
    const c = src[i];
    if (started && /^\d+$/.test(cur)) {
      cur = '';
      started = false;
    } else flushWord();
    if (pending) bail();
    let j = i + 1;
    const n = src[j];
    if (n === '(' || (c === '<' && n === '<')) bail();
    if (c === '<') {
      if (n === '&') {
        j += 1;
        while (/[\d-]/.test(src[j] ?? '')) j += 1;
        return j;
      }
      pending = 'read';
      return j;
    }
    if (n === '>' || n === '|') j += 1;
    else if (n === '&') {
      j += 1;
      while (/[\d-]/.test(src[j] ?? '')) j += 1;
      return j;
    }
    pending = 'write';
    return j;
  };

  let i = start;
  for (; i < src.length; i++) {
    const c = src[i] as string;
    if (c === ' ' || c === '\t' || c === '\r') {
      flushWord();
      continue;
    }
    if (c === '\n') {
      flushWord();
      if (!segEmpty()) endSegment();
      continue;
    }
    if (c === ';') {
      operator();
      continue;
    }
    if (c === '|') {
      operator();
      if (src[i + 1] === '|') i += 1;
      else if (src[i + 1] === '&' && !ps) i += 1;
      else pipedIn = true;
      needOperand = true;
      continue;
    }
    if (c === '&') {
      if (src[i + 1] === '&') {
        operator();
        needOperand = true;
        i += 1;
        continue;
      }
      if (!ps && src[i + 1] === '>') {
        flushWord();
        i += 1;
        if (src[i + 1] === '>') i += 1;
        pending = 'write';
        continue;
      }
      if (ps) {
        flushWord();
        bail(segEmpty() ? 'dynamic_execution' : 'untokenizable');
      }
      flushWord();
      if (segEmpty()) bail();
      endSegment('background');
      continue;
    }
    if (c === '>' || c === '<') {
      i = redirect(i) - 1;
      continue;
    }
    if (c === '(') bail();
    if (c === ')') {
      if (!inSubst) bail();
      operator();
      return { segments: out, next: i + 1 };
    }
    if (c === '$' && src[i + 1] === '(') {
      i = sub(src, i + 2, true) - 1;
      continue;
    }
    if (c === '`') {
      if (ps) {
        if (i + 1 >= src.length) bail();
        cur += src[i + 1];
        started = true;
        i += 1;
      } else i = backtick(i) - 1;
      continue;
    }
    if (c === '\\' && !ps) {
      if (src[i + 1] === undefined) bail();
      if (src[i + 1] !== '\n') {
        cur += src[i + 1];
        started = true;
      }
      i += 1;
      continue;
    }
    if (c === '"' || c === "'") {
      i = (c === '"' ? dquote(i) : squote(i)) - 1;
      continue;
    }
    cur += c;
    started = true;
  }
  if (inSubst) bail();
  flushWord();
  if (segEmpty()) {
    if (needOperand) bail();
  } else endSegment();
  return { segments: out, next: i };
}
