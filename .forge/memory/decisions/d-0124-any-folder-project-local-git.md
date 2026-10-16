---
id: d-0124
kind: decision
statement: Forge works on any folder, with or without git. A project needs git to work, so when the chosen folder has no repository Forge tells the user and initialises a local one; the user chooses between a snapshot commit of the existing files (default; Forge adds a standard .gitignore when none exists and shows the file count and size first) and init only. A GitHub remote is optional: a project without one merges verified work locally into its base branch through the same merge door and gates as a pull-request project, and this must work end to end with the agents (dispatch, worktrees, gates, rework). When the folder sits inside an existing repository the user chooses between using the repository's top folder (default) and registering the repository with the project scoped to that subfolder; Forge never runs a nested git init. This is validated project-wide as a main aspect of onboarding.
source: { type: chat, ref: "2026-10-16 user: \"i want forge to worked on every project, having git or not is not important. if it dont have git then inform user that we will need git for this towork, current will init a local git for this, and this needs to be validated full project wise an main aspect\"; follow-ups: local merge \"go with option 1, but we also have to make sure this works with our agents properly\"; first commit \"giver user option to select, default to option 1\"; subfolder \"also give user options to select\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
amends: [d-0083]
tags: [git, onboarding, projects, merge, multi-repo]
pinned: false
---
d-0083's GitHub App rule still holds for projects that use GitHub; this record
removes the requirement that every project starts from a GitHub repository.
Director note: a local merge into a branch that is checked out in the user's
folder must not clobber uncommitted work; when the folder is dirty the merge
waits and asks the user (Needs you) instead of forcing.
