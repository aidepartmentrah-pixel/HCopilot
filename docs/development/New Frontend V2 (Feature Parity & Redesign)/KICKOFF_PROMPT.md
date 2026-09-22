okay here We will be doing the second wave of the new frontend build. This is
an autonomous mission you do on your own — I will leave you here.

Repo: `C:\Users\it\Documents\HCopilot\HCopilot`. Run `git status` and
`git log --oneline -10` first to orient — do not assume the branch or
commit state; a lot has happened since this prompt was written and I'm not
going to re-describe it to you.

**What this mission is**: `frontend-new/` (React + TypeScript + Vite) is the
new frontend, built in a first wave (NF0–NF9, see
`docs/development/New Frontend (React Rewrite)/0. Slicing Task Table.md` and
its README `frontend-new/README.md`) alongside the old, untouched
`frontend/`, against the same backend. That first wave shipped all 6 pages
but simplified the clinical/operational UX too aggressively in places, lost
functionality the old frontend had, and is missing a Predictions page
outright. This second wave fixes that.

**Your two required reads before writing any code**:
1. `docs/development/New Frontend V2 (Feature Parity & Redesign)/0. Slicing
   Task Table.md` — the slice breakdown (V2.0–V2.8), their scope, their
   Definition of Done, and their testing approach. This is your execution
   order and your progress tracker. Update it with a dated log entry after
   *every* slice, the same way NF0–NF9 logged themselves — real command
   output, bugs found, scope decisions, not just a checkbox flip.
2. `docs/development/New Frontend V2 (Feature Parity & Redesign)/source/11.
   New Stack Missing Functions.md` — the actual spec, verbatim from the
   product owner. Each page section ends with "Locked Decisions" and
   "Definition of Done" — those are your real acceptance criteria, not the
   slicing table's summaries of them. Read the section for whichever slice
   you're on, in full, before touching that page's code.

**Standing rules** (the slicing table repeats these at the top — read them
there too, this is not exhaustive):
- Never fabricate data. Two ChatGPT-generated mockup/logo images are
  referenced in the spec (`C:\Users\it\Downloads\ChatGPT Image Sep 22,
  2026, *.png`) — they are layout/feel references only. Every number,
  label, or alert shown must trace to a real backend field. If a mockup
  implies data that doesn't exist (a fake trend %, a fake integration
  status), use the spec's own documented empty/unavailable state instead.
  This project has a standing, explicit rule against "GPT assumption" in
  images — the mockups show flow and structure, not literal content to
  copy in.
- No emoji as UI graphics — Lucide React icons only.
- CSS Modules, no styling library, same design tokens
  (`frontend-new/src/design-system/tokens.css` — don't refork it, the
  semantic colors were already tuned for real WCAG AA contrast in NF8.2).
- `dir="auto"` on every patient-name-bearing field — Arabic names are
  first-class on every page this wave touches.
- Air-gapped: anything new (a charting library, the logo assets, fonts)
  must be locally bundled and re-verified against
  `frontend-new/e2e/airgapped.spec.ts`. If a slice needs a new runtime
  dependency (Statistics/Predictions will need a charting library), that's
  a real decision — pick one, bundle it locally, note the choice and why in
  the slicing table's log, don't ask permission mid-flight since nobody's
  watching, just make the call and record it.
- A slice isn't done until its own tests pass, and pass twice in a row
  before you call it done — this project's own established discipline (see
  NF8's log entries for why: a fix that "looks" fixed once wasn't trusted).
- Testing shape: Vitest + RTL colocated with new components/pure logic.
  Playwright e2e against the **real backend** (`docker compose up` first,
  same `fullyParallel: false, workers: 1` convention as the existing
  `frontend-new/playwright.config.ts` — the `/api/patients/next-ids` race
  condition this works around is still unfixed backend-side, don't
  re-discover it). Where a slice's UI depends on a backend endpoint
  `frontend-new` hasn't exercised yet (Hospital Directory settings, model
  training/promotion, accounts/permissions), smoke-test that endpoint's
  real response shape first — don't guess the contract from the old
  frontend's JS and build UI against an assumption.
- Don't touch `frontend/` (old) or change backend behavior unless a slice
  genuinely needs a missing backend capability — check first, most of what
  this spec calls "missing" is old-frontend-only UI over data the backend
  already exposes (Hospital Directory and model training backends already
  exist and were committed recently — check before assuming you need to
  build them).
- One commit per completed slice (or natural sub-slice for V2.2's a/b/c
  split). Do not merge to `main` and do not push — report back when the
  whole mission (or a sensible stopping point) is done, that decision is
  not yours to make.
- If you find an already-live, uncommitted change in the working tree that
  you didn't make (check `git status` before touching anything broadly) —
  don't touch it, it likely belongs to a different concurrent initiative in
  this same repo (there was one called "Legacy Frontend Shell & Dashboard
  Refresh" targeting the *old* frontend, unrelated to this mission — don't
  confuse the two, and don't assume it's still running or already finished
  by the time you read this).

**Order**: work the slices in the table's dependency order (V2.0 first,
everything else depends on it; V2.2a→b→c is sequential; V2.1 and V2.3–V2.7
can interleave after V2.0 if that's more efficient, but keep the git
history one-commit-per-slice regardless of interleaving order; V2.8 last).

**When you're done** (or you hit a real stopping point): update the
slicing table's top status line, make sure every touched slice's tests are
green twice in a row, and tell me — including a real Docker/browser link
if the stack is up, the same way the first wave ended with "give me the
link so I can see the website."
