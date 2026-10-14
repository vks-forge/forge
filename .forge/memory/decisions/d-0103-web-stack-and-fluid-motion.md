---
id: d-0103
kind: decision
statement: apps/web stack matches Paperclip's so components can be lifted - Vite, React 19, React Router, TanStack Query, Tailwind 4, Radix primitives with our own components on top (no shadcn styling), assistant-ui for live threads, lucide icons, `motion` for animation. Always the latest stable versions (exact pins, subject to the workspace minimum-release-age guard). Motion is a major requirement - the whole UI and UX is fully animated with spring-based, fluid motion and never janky or laggy: 60 fps, animate transform/opacity only, shared-layout and route transitions, optimistic updates, virtualised long lists and streaming threads, no layout thrash; honours prefers-reduced-motion.
source: { type: chat, ref: "2026-10-14 UI Q2: \"yes go with option 1, but make usre you use all latest. also i need full animated UI and UX, no jagger or lagging UI, everything should be psring fluid animated, this is major.\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
tags: [ui, apps-web, stack, motion, performance, dependencies]
pinned: true
---

Director note: reduced-motion support and the 60 fps budget are added as the
accessibility/performance floor of "fluid"; motion budget checked per screen
alongside the hallmark and Nielsen passes.
