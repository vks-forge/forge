/**
 * Segment loop of the shell tokenizer: walks one command string (or one `$(...)` body).
 *
 * Why: the operators that join commands (`;`, `&&`, `||`, `|`, `&`, newline) and the
 *   substitutions nested inside words decide which simple commands policy must judge. This
 *   loop turns that text into ordered segments, flags what makes a segment riskier
 *   (pipes, background, subshell) and aborts on anything it cannot represent, so a
 *   misread chain can never slip a command past the rules (d-0038).
 *
 * Exports: parseSeq().
 * Depends on: domain/shell-flags, domain/shell-quotes, domain/shell-redirect,
 *   types/tokenizer.types. No IO.
 */

import { scanRedirect } from '#/domain/shell-redirect.js';
import { MAX_DEPTH, bail, buildSegment, expandsHere } from '#/domain/shell-flags.js';
import {
  scanBacktick,
  scanDoubleQuoted,
  scanSingleQuoted,
} from '#/domain/shell-quotes.js';
import type {
  QuoteHost,
  ShellDialect,
  ShellFlag,
  ShellRedirect,
  ShellSegment,
} from '#/types/tokenizer.types.js';

/** Parses `src` from `start`; with `inSubst` it stops after the closing `)` and returns that index. */
export function parseSeq(
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
    if (!started) {
      return;
    }

    if (pending) {
      redirects.push({ mode: pending, target: cur });
    } else {
      words.push(cur);
    }

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
    if (pending || words.length === 0) {
      bail();
    }

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
    if (segEmpty()) {
      bail();
    }

    endSegment();
  };

  const sub = (body: string, from: number, closeParen: boolean): number => {
    if (depth >= MAX_DEPTH) {
      bail();
    }

    const r = parseSeq(body, from, dialect, depth + 1, closeParen);
    nested.push(...r.segments);
    flags.add('subshell');
    cur += '$(…)';
    started = true;

    return r.next;
  };

  const host: QuoteHost = {
    src,
    ps,
    sub,
    append: (text) => {
      cur += text;
    },
    markStarted: () => {
      started = true;
    },
    expansion: () => {
      flags.add('expansion');
    },
  };

  const redirect = (i: number): number => {
    if (started && /^\d+$/.test(cur)) {
      cur = '';
      started = false;
    } else {
      flushWord();
    }

    if (pending) {
      bail();
    }

    const scan = scanRedirect(src, i);
    pending = scan.mode;

    return scan.next;
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
      if (!segEmpty()) {
        endSegment();
      }

      continue;
    }

    if (c === ';') {
      operator();
      continue;
    }

    if (c === '|') {
      operator();
      if (src[i + 1] === '|') {
        i += 1;
      } else if (src[i + 1] === '&' && !ps) {
        i += 1;
      } else {
        pipedIn = true;
      }

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
        if (src[i + 1] === '>') {
          i += 1;
        }

        pending = 'write';
        continue;
      }

      if (ps) {
        flushWord();
        bail(segEmpty() ? 'dynamic_execution' : 'untokenizable');
      }

      flushWord();
      if (segEmpty()) {
        bail();
      }

      endSegment('background');
      continue;
    }

    if (c === '>' || c === '<') {
      i = redirect(i) - 1;
      continue;
    }

    if (c === '(') {
      bail();
    }

    if (c === ')') {
      if (!inSubst) {
        bail();
      }

      operator();

      return { segments: out, next: i + 1 };
    }

    if (c === '$' && src[i + 1] === '(') {
      i = sub(src, i + 2, true) - 1;
      continue;
    }

    if (c === '`') {
      if (ps) {
        if (i + 1 >= src.length) {
          bail();
        }

        cur += src[i + 1];
        started = true;
        i += 1;
      } else {
        i = scanBacktick(host, i) - 1;
      }

      continue;
    }

    if (c === '\\' && !ps) {
      if (src[i + 1] === undefined) {
        bail();
      }

      if (src[i + 1] !== '\n') {
        cur += src[i + 1];
        started = true;
      }

      i += 1;
      continue;
    }

    if (c === '"' || c === "'") {
      i = (c === '"' ? scanDoubleQuoted(host, i) : scanSingleQuoted(host, i)) - 1;
      continue;
    }

    if (expandsHere(src, i, ps, !started)) {
      flags.add('expansion');
    }

    cur += c;
    started = true;
  }

  if (inSubst) {
    bail();
  }

  flushWord();
  if (segEmpty()) {
    if (needOperand) {
      bail();
    }
  } else {
    endSegment();
  }

  return { segments: out, next: i };
}
