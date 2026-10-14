---
id: d-0073
kind: decision
statement: A critic agent must use a different model family from the Worker whose work it reviews (e.g. Claude Worker → GPT via Codex or Gemini critic), checked when the pipeline loads. Until a second harness is connected, a same-family critic is allowed with a visible warning on the pipeline load and on each ticket it reviews; once a different-family harness is available, a same-family critic is refused.
source: { type: chat, ref: "2026-10-14 grill x-0011 Q8: user chose 'Required for critics (Rec.)'" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
tags: [pipelines, agents, models, critic, x-0011]
pinned: false
---

Same-family models share blind spots and approve each other's output
(verification-plane.md §5). Model family is declared per model in config, not
inferred from the name.
