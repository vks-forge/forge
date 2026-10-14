---
id: d-0113
kind: decision
statement: The project sidebar gets an Issues page (a PRs page follows later) listing every open issue in the project's GitHub repo. An issue-analyst agent (the Director or a dedicated agent) automatically investigates each issue - deep code research, blast radius, relations to other issues, PRs, cards and tickets - and writes a report with findings and a verdict on the issue. If the verdict is that it can be solved without the user, a card is created automatically; if it needs the user, it waits on the Issues page (and in Needs you) for approval before a card is created. How CodeRabbit and similar tools analyse issues is to be researched (public docs and open-source code) and used to shape the report and verdict.
source: { type: chat, ref: "2026-10-14: \"i need a sidebar menu for Issues, later we will add PR also. this page willshow all the issues currently opened in git repo. director or any other agent specific for this work will auto check the issues, get deep dive into, get blast radius, realtions, meaing do full code research about the issue then gnerate a report with all findings and verdicts. cehck how the coderabbit etc is doing this(you can reverse enginner it). if issue can be solved without user in touch then it should uto created to card, if need user then wait for approval\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-14
superseded_by: null
supersedes: null
amends: [d-0105, d-0096, d-0111]
tags: [issues, github-issues, analysis, cards, director, ui]
pinned: true
---

Changes d-0105's flow for GitHub issues: an issue is first an analysed entry on
the Issues page; the card comes after the verdict (auto or approved). Chat
still creates cards directly. Depends on project context / code graph (x-0012).
Research running 2026-10-14 (CodeRabbit, Copilot coding agent, OpenHands
resolver, Sweep, Devin, Dosu, Greptile).
