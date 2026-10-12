---
id: d-0045
kind: decision
statement: Every hand-written `type` / `interface` lives in the package's `src/types/` folder (ports under `types/ports/`), mirroring how all tests live in one `__tests__/`. The only exception is `type X = z.infer<typeof X>` beside its zod schema in `schemas/`. Declarations elsewhere are a lint error; `types/` files export no runtime values.
source: { type: chat, ref: "2026-10-13 user: 'also need rule for storing types|interfaces etc into a separate folder like __tests__'" }
author: user
origin: owner
status: active
valid_from: 2026-10-13
approved_at: 2026-10-13
superseded_by: null
supersedes: null
tags: [code-rules, layout, types]
pinned: true
---

Replaces the `ports/` folder from d-0040 with `types/ports/`. Written into
`.claude/rules/code.md` rule 10.

Amendment 2026-10-13 (user: "rename types file to file-name.types.ts, save
this also"): every file under `types/` is named `<name>.types.ts`; the suffix
is used nowhere else. Lint-enforced.
