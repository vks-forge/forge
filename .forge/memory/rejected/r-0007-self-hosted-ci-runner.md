---
id: r-0007
kind: rejected
statement: Run CI on a self-hosted GitHub Actions runner (unlimited free minutes) and drop the Linux and macOS jobs.
source: { type: chat, ref: "2026-10-16 user asked about self-hosted CI; told it only pays off on a spare machine (on the work PC it brings the 25-minute suite back onto it; a Windows cloud VM costs more than the free plan); user: \"no skip this idea then\"" }
author: user
origin: owner
status: active
valid_from: 2026-10-16
tags: [ci, cost, testing]
---
Reason: no spare machine to host it; on the owner's work PC it would bring back the local slowdown d-0119 removed. Quota-paced GitHub-hosted CI (d-0121) stays. Reopen if a spare Windows box becomes available.
