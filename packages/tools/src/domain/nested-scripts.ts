/**
 * Nested scripts — the command strings an interpreter or `eval` will run.
 *
 * Why: `bash -c "git push"`, `cmd /c git push`, `powershell -Command "..."` and
 *   `eval "..."` carry a whole command line in one argument. Judging them by the first
 *   word (`bash`) lets every floor through, so the string argument is pulled out here and
 *   re-tokenised by the caller, which then applies the same floors to the inner commands.
 *   A PowerShell `-EncodedCommand` is base64 of UTF-16, decoded here so it cannot hide the
 *   text. Interpreters whose argument is not shell text (python, node, ...) are only
 *   returned for a loose textual scan (tool-system.md §5.2).
 *
 * Exports: nestedScripts(), looseFloorHit().
 * Depends on: domain/command-classes, types/tokenizer. No IO.
 */

import {
  EVAL_BUILTINS,
  SHELL_INTERPRETERS,
  isEvalFlag,
} from '#/domain/command-classes.js';
import type { NestedScript } from '#/types/tokenizer.types.js';

const NON_SHELL_EVAL = new Set([
  'python',
  'python3',
  'py',
  'node',
  'deno',
  'bun',
  'perl',
  'ruby',
  'php',
  'lua',
]);

/** True when `flag` abbreviates `-name` (PowerShell accepts any unambiguous prefix). */
const abbreviates = (flag: string, name: string, min = 1): boolean => {
  const f = flag.toLowerCase();
  return f.startsWith('-') && f.length - 1 >= min && name.startsWith(f.slice(1));
};

function powershell(args: readonly string[]): NestedScript[] {
  const out: NestedScript[] = [];
  for (const [i, a] of args.entries()) {
    if (abbreviates(a, 'command')) {
      out.push({ text: args.slice(i + 1).join(' '), dialect: 'powershell' });
    } else if (abbreviates(a, 'encodedcommand') && args[i + 1] !== undefined) {
      const text = Buffer.from(args[i + 1] as string, 'base64').toString('utf16le');
      out.push({ text, dialect: 'powershell' });
    }
  }
  return out;
}

/** Command strings that the command `cmd` (already unwrapped) will execute. */
export function nestedScripts(cmd: string, args: readonly string[]): NestedScript[] {
  if (EVAL_BUILTINS.has(cmd)) {
    return cmd === 'eval' ? [{ text: args.join(' '), dialect: 'bash' }] : [];
  }
  if (cmd === 'cmd') {
    const i = args.findIndex((a) => /^\/[ck]$/i.test(a));
    return i === -1 ? [] : [{ text: args.slice(i + 1).join(' '), dialect: 'bash' }];
  }
  if (cmd === 'powershell' || cmd === 'pwsh') return powershell(args);
  if (SHELL_INTERPRETERS.has(cmd)) {
    const out: NestedScript[] = [];
    for (const [i, a] of args.entries()) {
      if (/^-[a-z]*c[a-z]*$/.test(a) && args[i + 1] !== undefined) {
        out.push({ text: args[i + 1] as string, dialect: 'bash' });
      }
    }
    return out;
  }
  if (NON_SHELL_EVAL.has(cmd)) {
    return args
      .filter((_a, i) => i > 0 && isEvalFlag(args[i - 1] ?? ''))
      .map((text) => ({ text, dialect: null }));
  }
  return [];
}

const PUSH = /\bgit\b[^;&|]*\bpush\b/;
const PUBLISH = /\b(npm|pnpm|yarn|cargo|twine)\b[^;&|]*\b(publish|upload)\b/;

/**
 * Last-resort scan of text we could not tokenise: quotes, commas and brackets are turned
 * into spaces first so `os.system(['git','push'])` still reads as `git push`.
 */
export function looseFloorHit(text: string): string | null {
  const flat = text.toLowerCase().replace(/[^a-z0-9_:./\-]+/g, ' ');
  if (PUSH.test(flat)) return 'floor:argv:eval-text';
  if (PUBLISH.test(flat)) return 'floor:argv:eval-text';
  return null;
}
