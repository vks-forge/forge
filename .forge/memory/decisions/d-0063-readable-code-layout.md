---
id: d-0063
kind: decision
statement: Source must read like a careful human wrote it, for a project many developers contribute to. Prettier stays the formatter; ESLint auto-fix enforces what Prettier cannot — `curly: all` (every if/else/loop body in braces, so bodies sit on their own lines) and blank-line padding via `@stylistic/padding-line-between-statements` (blank line before `return`, after variable-declaration groups, around multi-line blocks and after early-return guards). The whole repo is reformatted once with `eslint --fix` + `prettier --write`; builders write in this style and the lint gate keeps it.
source: { type: chat, ref: "2026-10-13 user: \"files lines|spaces|enter etc not proper, currently looks like its written by AI so a normal human can't read and understand its properly ... use proper preetier configs so eveything shosuld be very clean, majorly keeping in mind that many deleoper will contributes in this project\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-13
superseded_by: null
supersedes: null
tags: [code-style, prettier, eslint, readability]
pinned: true
---

Prettier preserves blank lines but never inserts them, and it collapses a short
braceless `if (x) return y;` onto one line, so the user's example (body on its
own line, blank lines between logical steps) is only enforceable through ESLint
auto-fix rules. Braces (`curly: all`) are the tool-enforceable form of "body on
its own line".
