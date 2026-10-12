---
title: AI Code Review Only Catches Half of Your Bugs – O’Reilly
id: ai-code-review-only-catches-half-of-your-bugs-oreilly
tags:
- ai-software-factory-architecture-58e4cc
- requirements-driven-review
- zero-hallucination
created: '2026-10-12T08:29:12.355343Z'
updated: '2026-10-12T08:32:51.001897Z'
source: https://www.oreilly.com/radar/ai-code-review-only-catches-half-of-your-bugs/
source_domain: www.oreilly.com
fetched_at: '2026-10-12T08:29:12.351675Z'
fetch_provider: builtin
status: draft
type: note
tier: unknown
content_type: unknown
deprecated: false
summary: 'O''Reilly Radar article (Andrew Stellman, Apr 2026, part 5 of an agentic-engineering
  series) argues AI code review hits an ''intent ceiling'': structural analysis (linters,
  SAST, AI reviewers) can only catch bugs visible from code alone, but roughly half
  of security defects are design flaws/intent violations invisible without a specification
  of what the code is SUPPOSED to do. Cites NIST SATE evaluations finding best static
  analysis tools plateau at 50-60% detection for security vulnerabilities; Gary McGraw''s
  ''Software Security: Building Security In'' (2006) splitting defects ~50/50 implementation
  bugs vs design flaws; Charoenwet et al. (ISSTA 2024) testing 5 SAST tools against
  815 real vulnerability-contributing commits, finding 22% of vulnerable commits entirely
  undetected and 76% of warnings in vulnerable functions irrelevant; CWE-862 Missing
  Authorization ranked #9 on the 2024 CWE Top 25. Proposes deriving ''negative requirements''
  from chat logs, GitHub issues, and design discussions to give AI reviewers intent
  to check against — exemplified by a confirmed/merged fix to Google''s Gson library
  (PR #3006) found by analyzing GitHub issues #676/#913/#948/#1558. Describes a four-step
  method: AI lists observed behavioral contracts, derives requirements, checks coverage,
  asserts completeness and loops back on gaps. Discloses the author''s own patent
  application tied to the open-source ''Quality Playbook'' tool.'
---

AI Code Review Only Catches Half of Your Bugs – O’Reilly
Skip to main content
Search for books, courses, events, and more
Toggle dark mode
AI & ML
Business
Data
Innovation
Research
Security
Try the O’Reilly learning platform
With the O’Reilly learning platform, you get the resources and guidance to keep your skills sharp and stay ahead. Try it free for up to 14 days.
Start trial
Try a course for free
Join a live online event on the O’Reilly platform to learn from the experts shaping tech.
See what’s coming soon
Get the Radar Trends newsletter
Your email
Country
- Select country -
United States
Afghanistan
Albania
Algeria
Andorra
Angola
Antigua and Barbuda
Argentina
Armenia
Aruba
Australia
Austria
Azerbaijan
The Bahamas
Bahrain
Bangladesh
Barbados
Belarus
Belgium
Belize
Benin
Bermuda
Bhutan
Bolivia
Bosnia and Herzegovina
Botswana
Brazil
Brunei
Bulgaria
Burkina Faso
Burundi
Cambodia
Cameroon
Canada
Cape Verde
Central African Republic
Chad
Chile
People's Republic of China
Colombia
Comoros
Congo, Republic of the
Congo, Democratic Republic of the
Cook Islands
Costa Rica
Côte d'Ivoire (Ivory Coast)
Croatia
Cuba
Cyprus
Czechia
Denmark
Djibouti
Dominica
Dominican Republic
Ecuador
Egypt
El Salvador
Equatorial Guinea
Eritrea
Estonia
Eswatini (formerly Swaziland)
Ethiopia
Federated States of Micronesia
Fiji
Finland
France
Gabon
The Gambia
Georgia
Germany
Ghana
Greece
Grenada
Guatemala
Guinea
Guinea-Bissau
Guyana
Haiti
Honduras
Hungary
Iceland
India
Indonesia
Iran
Iraq
Ireland
Israel
Italy
Jamaica
Japan
Jordan
Kazakhstan
Kenya
Kiribati
Korea, Democratic People's Republic of
Korea, Republic of
Kuwait
Kyrgyzstan
Laos
Latvia
Lebanon
Lesotho
Liberia
Libya
Liechtenstein
Lithuania
Luxembourg
Macedonia, Republic of
Madagascar
Malawi
Malaysia
Maldives
Mali
Malta
Mauritania
Mauritius
Mexico
Moldova
Monaco
Mongolia
Montenegro
Morocco
Mozambique
Myanmar
Namibia
Nauru
Nepal
Netherlands
New Zealand
Nicaragua
Niger
Nigeria
Niue
Norway
Oman
Pakistan
Palestine, State of
Panama
Papua New Guinea
Paraguay
Peru
Philippines
Poland
Portugal
Qatar
Romania
Russia
Rwanda
Saint Kitts and Nevis
Saint Lucia
Saint Vincent and the Grenadines
Samoa
San Marino
São Tomé and Príncipe
Saudi Arabia
Senegal
Serbia
Seychelles
Sierra Leone
Singapore
Slovakia
Slovenia
Solomon Islands
Somalia
South Africa
South Sudan
Spain
Sri Lanka
Sudan
Suriname
Sweden
Switzerland
Syria
Taiwan
Tajikistan
Tanzania
Thailand
Timor-Leste (East Timor)
Togo
Tonga
Trinidad and Tobago
Tunisia
Turkey
Turkmenistan
Tuvalu
Uganda
Ukraine
United Arab Emirates
United Kingdom
United States
Uruguay
Uzbekistan
Vanuatu
Vatican City
Venezuela
Vietnam
Yemen
Zambia
Zimbabwe
Subscribe
Please read our
privacy policy
.
Thank you for subscribing to the O’Reilly Radar Trends to Watch newsletter.
Radar
>
Topics
>
AI & ML
AI Code Review Only Catches Half of Your Bugs
Luckily, there's a way to catch the ones that no structural analysis ever will
By
Andrew Stellman
April 30, 2026 • 15 minute read
Share
Close
LinkedIn
X
Facebook
Threads
Bluesky
Reddit
This is the fifth article in a series on agentic engineering and AI-driven development. Read part one
here
, part two
here
, part three
here
, and part four
here
.
I recently had a taste of humility with my AI-generated code. I live in Park Slope, Brooklyn, and recently I needed to get to the other side of the neighborhood. I thought I’d be clever: I like taking the bus, so I decided to hop on the one that goes right down 7th Avenue. I know I could check the schedule using the MTA’s really useful Bus Time app or website, but it doesn’t take into account walking time from my house or give me a good idea of when to leave. This seemed like a great opportunity to vibe code an app and do some quick AI-driven development.
It took about two minutes for Claude Code to get my new app working. It made a lovely little web UI, I configured my stop and how long it takes me to walk there, and it gave me the perfect departure time.
When I actually walked out the door, the app perfectly predicted my wait. There was just one problem: my bus was nowhere to be seen. What I
did
see was a bus driving the exact opposite direction down 7th Avenue.
It was pretty obvious what had happened. I needed to go deeper into Brooklyn, not towards Manhattan, and the AI had picked the wrong direction. (Actually, as Cowork pointed out, each stop has its own ID, and it had selected the ID for the wrong stop.) I’d been using Cowork to orchestrate everything, and I could easily have just asked it to go out and check the MTA’s BusTime site for me to make sure the app was working. But I just trusted the AI. As a result, I had to walk. Which is fine—I love walking—but the irony was painful. I had literally just published an article about AI code quality and why you shouldn’t blindly trust it, and here I was doing exactly that.
The app had a bug. But it wasn’t the kind of bug you’d necessarily catch using a typical AI code review prompt. It built, ran, and did a perfectly fine job parsing the JSON from the MTA API. But if I’d started with a simple requirement—even just a user story like “as a Park Slope resident, I want to catch the B69 headed towards Kensington so I can get deeper into Brooklyn”—the AI would have built it differently. The problem is that AI can only build the thing you tell it to build, which isn’t necessarily the thing you
wanted
it to build.
AI is really good at writing “correct” code that does the wrong thing.
My Brooklyn bus detour was a minor inconvenience. But it was a really useful, small-scale example of what I kept running into in my larger projects, too. There’s an entire class of bugs that you simply can’t find with structural analysis—no linter, no static analyzer, no AI code reviewer will catch them—because the code isn’t wrong in any way that’s visible from the code alone. You need to know what the code was supposed to do. You need to know the intent.
The data on why requirements matter goes back decades. Back in the 1990s, for example, the Standish CHAOS reports were a big eye-opener for me and a lot of other people in the industry, large-scale data confirming what we’d been seeing on our own projects: that the most expensive defects trace back to misunderstood or missing requirements. Those reports really underscored the idea that poor requirements management, and specifically incomplete or frequently changing specifications, were one of the most primary drivers behind IT project failures. (And, as far as I can tell, they still are, and AI isn’t helping things—see my O’Reilly Radar article, “
Prompt Engineering Is Requirements Engineering
”).
The idea that requirements problems really are the source of the most expensive kind of defects should make intuitive sense: If you build the wrong thing, you have to tear it apart and rebuild it. That’s why I made requirements the foundation of the
Quality Playbook
, an open-source skill for AI tools like Claude Code, Cursor, and Copilot that I introduced in the
previous article
. I’ve spent decades doing test-driven development, partnering with QA teams, welcoming the harshest code reviews from teammates who don’t pull punches—and that experience led me to build a tool that uses AI to bring back quality engineering practices the industry abandoned decades ago. I’ve tested it against a wide range of open-source projects in Go, Java, Rust, Python, and C#, from small utilities to widely-used libraries with tens of thousands of stars, and it’s found real bugs in almost every project it’s come across, including ones that have been confirmed and merged upstream.
I think there are a lot of wider lessons we can learn from my experience using requirements to help AI find bugs—especially security bugs. So in this article, I want to focus on the single most important thing I’ve learned from building it: everything depends on requirements. Not just any requirements, but a specific kind of requirement that most projects don’t have, that most AI tools don’t ask for, and that turns out to be the key to making AI actually useful for verifying code quality.
Spec-driven development and what it misses
Developers using AI tools have been rediscovering the value of writing things down before asking the AI to build them. Spec-driven development (SDD) has become very popular, and for good reason. Addy Osmani wrote an excellent piece on this, “
How to Write a Good Spec for AI Agents
,” and the core idea is sound: If you write a clear specification of what you want built, the AI produces dramatically better results than if you just describe it in a chat prompt and hope for the best.
I think SDD is important, and I’d encourage any developer working with AI to adopt it. But as I was building the Quality Playbook, I discovered that SDD has a blind spot that matters a lot for code quality. An SDD spec describes the
how
—what the implementation should look like. It tells the AI “implement a duplicate key check” or “add a retry mechanism with exponential backoff” or “create a REST endpoint that returns paginated results.” That’s useful for building things. But it’s not enough for verifying them.
But a requirement doesn’t say “implement a duplicate key check.” It says “users depend on Gson to reject ambiguous input so they don’t silently accept corrupted data.” The AI can reason about the second one in ways it can’t reason about the first, because the second one has the purpose attached. When the AI knows the purpose, it can evaluate whether the code actually fulfills that purpose across all the edge cases, not just the ones the spec explicitly listed. That’s how the Quality Playbook caught a bug in Google’s Gson library, one of the most widely used JSON libraries in Java.
I think it’s worth digging into that particular bug, because it’s a great example of just how powerful requirements analysis can be for finding defects. The playbook derived null-handling requirements from Gson’s own community—GitHub issues
#676
,
#913
,
#948
, and
#1558
, some dating back to 2016—then used those requirements to find that duplicate keys were silently accepted when the first value was null. It confirmed the bug by generating a failing test, then patched the code and verified the test passed. I’ve used Gson for years and done a lot of work with Java serialization, so I read the code and the fix myself before submitting anything—trust but verify. The fix was merged as
https://github.com/google/gson/pull/3006
, confirmed by Google’s own test suite.
That bug had been hiding in plain sight for years, through thousands of tests and countless code reviews. But it’s possible that no structural analysis might have ever found it because you needed the requirement to know it was wrong.
This distinction might sound academic, but it has very concrete consequences for whether your AI can actually find bugs in your code.
About half of all security bugs are invisible to structural analysis
The security world has known about the limits of structural analysis for a long time. The
NIST SATE evaluations
found that
the best static analysis tools plateaued at around 50-60% detection rates for security vulnerabilities
. Gary McGraw’s
Software Security: Building Security In
(Addison-Wesley, 2006) explains why: Roughly 50% of security defects are implementation bugs, and the other 50% are design flaws. Static analysis tools target the implementation bugs—buffer overflows, SQL injection, format string vulnerabilities—because those are pattern-matchable. But design flaws are about intent: The system’s architecture doesn’t enforce the security properties it’s supposed to enforce, and no amount of scanning the code will reveal that. A
2024 study by Charoenwet et al.
(ISSTA 2024) confirmed this is still the case: They tested five static analysis tools against 815 real vulnerability-contributing commits and found that 22% of vulnerable commits went entirely undetected, and 76% of warnings in vulnerable functions were irrelevant to the actual vulnerability. The pattern is consistent across two decades of research: There’s a ceiling on what you can find by analyzing code, and it’s around half.
There’s a good reason for that limitation: the
intent ceiling
. A structural analysis tool is limited to reading the code and looking at what it does; it has no way to take into account
what the developer intended it to do
.
When an AI does a code review without requirements, it’s limited to structural analysis: pattern matching, code smell detection, race condition analysis. It can ask “does this look right?” but it can’t ask “does this do what it’s supposed to do?” because it doesn’t know what the code is supposed to do. Structural review catches genuinely important stuff—race conditions, null pointer issues, resource leaks, concurrency bugs. A structural reviewer looking at a shell script will catch a missing
`fi`
, a bad variable expansion, a race condition. Structural review is useful, and structural review is what most AI code review tools do today.
But about half of all security defects are intent violations: things the code doesn’t do that it was supposed to do, or things it does that it wasn’t supposed to do. They’re invisible without a specification to check against, and no tool will find them by looking at code that is, structurally, perfectly sound. A structural reviewer looking at a script that’s, say, used to check router configuration files, might find well-formed bash, correct syntax, proper quoting, and code that looks like it works and doesn’t match known antipatterns. It wouldn’t know the script is only validating three of the five access control rules it’s supposed to enforce because that’s a requirements question, not a syntax question.
Or, more personally for me, this is what happened with my bus tracker app: The JSON parsing was flawless, the UI was correct, the timing logic worked perfectly. The only problem was that it showed buses headed towards Manhattan when I needed to go deeper into Brooklyn—and no structural analysis would ever catch that, because you need to know which direction I intended to go. That’s me and my very clever AI hitting the intent ceiling.
The intent ceiling is a security problem
This is where it gets really serious, because security vulnerabilities are some of the most dangerous members of this class of invisible bugs.
Think about what a missing authorization check looks like to an AI code reviewer. Let’s say you’ve got a web endpoint with a well-formed HTTP handler, properly sanitized inputs, and a safe database query. The code is clean, and passes every structural check and static analysis tool you’ve thrown at it. Now you’re testing it and, much to your dismay, you discover that the endpoint lets any authenticated user delete any other user’s data because nobody ever wrote down the requirement that says “only administrators can perform deletions.” That’s
CWE-862: Missing Authorization
, and it rose to #9 on the
2024 CWE Top 25
most dangerous software weaknesses.
That’s not a coding error! It’s a missing requirement.
That’s McGraw’s point: About half of all security defects aren’t implementation bugs at all. They’re design flaws, places where the system’s architecture doesn’t enforce the security properties it was supposed to enforce. A cross-site scripting vulnerability isn’t always a failure to sanitize input. Sometimes it’s a failure to define which inputs are trusted and which aren’t. A privilege escalation isn’t always a broken access check. Sometimes there was never an access check to begin with because nobody specified that one was needed. These are intent violations and they’re invisible to any tool that doesn’t know what the software is supposed to prevent.
AI code review tools today are very good at catching the implementation half of McGraw’s split. They can spot a SQL injection pattern, flag an unsafe deserialization, identify a buffer overflow. But they’re working on the same side of the 50/50 line that static analysis has always worked on. The design half—the missing authorization checks, the unspecified trust boundaries, the security properties that were never written down—requires the same thing that catching my bus tracker bug required: knowing what the software was supposed to do in the first place.
How the Quality Playbook derives requirements (and how you can too!)
The problem most projects face is that they don’t have formal requirements. What they have is code, documentation, commit messages, chat history, README files, and maybe some design docs. The question is how to get from that mess to a specification that an AI can actually use for verification.
The key insight I had while building the playbook was that every previous approach I tried asked the model to do two things at once: figure out what contracts exist AND write requirements for them. That doesn’t work—the model runs out of attention trying to hold the entire behavioral surface in its head while also producing formatted requirements. So I split them apart into four steps: First, have the AI read each source file and write down every behavioral contract it observes as a simple list. Second, derive requirements from those contracts plus the documentation. Third, check whether every contract is covered by a requirement. Fourth, assert completeness—and if there are gaps, go back to step one for the files with gaps.
The key idea is that the contracts file is external memory. When the model “forgets” about a behavioral contract it noticed earlier, that forgetting is normally invisible. With a contracts file, every observation is written down before any requirements work begins, so an uncovered contract is a visible, greppable gap.
You don’t need the Quality Playbook to do this—you can apply the same technique with any AI coding tool that you’re already using. Here’s what I’d recommend:
Write down what your software is supposed to guarantee.
Not just what it does—what it’s supposed to do, for whom, under what conditions. If you’re practicing spec-driven development, you’re already partway there. The next step is adding the
why
: Why does this behavior matter, who depends on it, what goes wrong if it fails? That’s the difference between a spec and a requirement, and it’s the difference between an AI that can build your code and an AI that can verify it.
Feed the AI your intent, not just your code.
The intent is already sitting in your chat history, your design discussions, your Slack threads, your support tickets. Every Claude export, every Gemini conversation, every Cowork transcript contains design intent that never made it into specifications: why a function was written a certain way, what failure prompted an architectural decision, what tradeoffs were discussed before choosing an approach. The design intent that used to require a human to extract and document is now sitting in your chat logs. Your AI can read the transcripts and extract the
why
.
Look for the negative requirements.
What should your software
not
do? What states should be impossible? What data should never be exposed? These negative requirements are often the most valuable because they define boundaries that structural review can’t see. The missing authorization bug was a negative requirement: Unauthenticated users must
not
be able to delete other users’ data. The Gson bug was a negative requirement: Duplicate keys must
not
be silently accepted when the first value is null. If you can articulate what your software must never do, you’ve given the AI something powerful to check against.
In the next article, I’ll talk about context management—the skill that actually determines whether your AI sessions produce good work or mediocre work. Everything I’ve described here depends on the AI having the right information at the right time, and it turns out that managing what the AI knows (and what it forgets) is an engineering discipline in its own right. I’ll cover how I went from running 15 million tokens in a single prompt to splitting the playbook into independent phases with zero context carryover, and why that transition worked on the first try.
The
Quality Playbook
is open source and works with GitHub Copilot, Cursor, and Claude Code. It’s also available as part of
awesome-copilot
.
Disclosure: Aspects of the methodology described in this article are the subject of US Provisional Patent Application No. 64/044,178, filed April 20, 2026 by the author. The open-source Quality Playbook project (Apache 2.0) includes a patent grant to users of that project under the terms of the Apache 2.0 license.
Post topics:
AI & ML