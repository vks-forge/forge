---
id: d-0157
kind: decision
statement: Archived projects appear in the project switcher dropdown under a separate "Archived" section, and the owner can unarchive a project (from the switcher and from project settings), which returns it to ready and to normal serving. Opening an archived project shows it read-only with an Unarchive action.
source: { type: chat, ref: "2026-10-16 user: \"archive projects should also show in project selected dowdown with under section Archived. user can also unarchive the project as needed. currently this is missing.\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
amends: [d-0104]
tags: [projects, ui, navigation]
pinned: false
---
Archive previously had no reverse (archive-section.tsx said "cannot be undone from
here"); this record adds the reverse.
