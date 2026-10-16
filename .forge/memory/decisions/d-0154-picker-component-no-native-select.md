---
id: d-0154
kind: decision
statement: The web app uses one shared Picker component for every dropdown and never the native HTML select. It is built on Radix Popover (same family and internals as the dialog, dropdown and tooltip already in use, version pinned to match), with rich rows (icon, label, description, badge, disabled state with reason), optional search for long lists, groups, full keyboard support and listbox/combobox roles, theme tokens and reduced-motion-aware animation. Existing native selects (board filters, card type, settings, agent forms) are replaced.
source: { type: chat, ref: "2026-10-16 user: \"for drodown also create a beautiful component in frontend to look better, dont use html native select for this.\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
tags: [web, ui, components]
pinned: false
---
