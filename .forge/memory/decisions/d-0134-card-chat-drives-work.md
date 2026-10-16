---
id: d-0134
kind: decision
statement: The card page is chat-first - the chat is always visible as the main column, Plan / Tickets / Details sit in a side panel (tabs on phones). Chat carries Director questions (options as buttons, one badged recommended, Other free text, "use your recommendations for the rest", open-point count), the user's answers, quiet live system lines, a Plan-ready message with Review, and a pinned Needs-you banner while the Director waits. Every Director turn is triggered and recorded (card created, user message, plan action, ticket escalation, Worker blocked, upstream card changed). Cards move through phases grilling -> verifying -> plan ready -> approved -> in progress -> done, with needs-you as an overlay, through one transition door like tickets; the queue of unanswered user messages is stored durably, not in memory. Another grill round can be started by the user (chat or Re-plan), by the Director (plan proven wrong, ticket bigger than planned, upstream card changed: card back to Shaping with "needs another round" questions), or by Request changes; it covers only what changed, then a new plan version goes through approval again. Done tickets stay, affected running tickets pause (Director decides, d-0110), not-started tickets are updated, cancelled or added, with the change list shown first.
source: { type: chat, ref: "2026-10-16 user, grill Q7 (card chat flow proposal): \"ok, i mean to say about the tickets not the card...\" - accepted the card chat proposal before asking about blocked tickets" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
superseded_by: null
supersedes: null
amends: [d-0109, d-0128, d-0130]
tags: [director, cards, chat, planning, state-machine, ui]
pinned: false
---
Found on 2026-10-16: the card chat existed but the Director never spoke on a new
card - intake writes the first user_message without queuing a reply
(tick/intake.ts vs tick/card-chat-post.ts), and the pending-reply set lived only
in engine memory.
