# Kickoff prompt — New Frontend (React Rewrite)

Paste everything below the line into a fresh Claude Code session,
opened on this repo (`C:\Users\it\Documents\HCopilot\HCopilot`).

---

I want you to build HCopilot's new React frontend — a full ground-up
rewrite running in parallel with the existing vanilla-JS frontend,
already fully planned and sliced by a prior session. Read these two
files first, in full, before doing anything else:

1. `docs/development/New Frontend (React Rewrite)/0. Slicing Task
   Table.md` — the live tracker: background, confirmed environment
   facts (free port, CORS already open, Node already installed), how
   this relates to two other in-progress HCopilot initiatives, the
   full NF0–NF9 slice breakdown, testing design, status table.
2. `docs/development/New Frontend (React Rewrite)/source/
   HCopilot_New_Frontend_Master_Prompt.md` — the original mission spec
   this all comes from (design system, page-by-page requirements,
   technology choices, testing/deployment requirements, Definition of
   Done). This is the authoritative spec — the tracking doc is the
   plan for executing it, not a replacement for reading it.

## Before writing any code

Read `docs/development/ER UI Architecture Redesign/0. Slicing Task
Table.md` too. That's a **separate, currently in-progress** HCopilot
initiative (branch `er-ui-architecture-redesign`) implementing the
*same 3 page-architecture decisions* (ISBAR entry, Live ER Board,
History) as **in-place edits to the existing vanilla-JS frontend** —
which is exactly what this master prompt tells you not to do to that
frontend. It already resolved 3 real open questions directly with the
user (create-on-pick timing, catch-all vs. per-ward waiting lane, the
`triage_time`-based waiting-alert definition) — reuse those confirmed
answers here rather than re-deriving or re-asking; the tracking doc's
"How this relates" section restates them for you.

What hasn't been decided: whether that in-place work should keep going
alongside this rewrite, or whether starting this rewrite means it
should pause. **Ask the user this directly, once, before deep work
starts on Pages A/B/C (Phases 3–5)** — both are reasonable and it's
their call, not yours to assume.

## How to work

- **Branch**: create a new branch before touching anything (check
  `git status`/`git branch` first — there are at least 2 other active
  branches on this repo right now, confirm you're branching from the
  right base and not stepping on either). Never commit unless the user
  explicitly asks, even under full autonomy.
- **Phase order**: NF0 (scaffold) → NF1 (design system) → NF2 (typed
  API layer) → NF3–NF7 (the 5 pages) → NF8 (polish) → NF9 (docs/DoD),
  per the tracking doc's own slice breakdown. Don't skip NF2's real
  backend audit and start guessing at API shapes — read the actual
  current `backend/features/*/api.py` files.
- **Update the tracking doc as you go**, the same way the other two
  HCopilot initiatives' own docs do: status table kept current, a
  dated "Live status log" entry appended after each slice actually
  lands (add that section if it doesn't exist yet) — not a batch
  summary at the end. The user wants to open this file and see real
  progress.
- **This is a large mission — say so if the budget runs out before
  it's done.** Don't compress phases to appear finished; stop at a
  clean slice boundary, leave the status table honest, and say clearly
  what's left, the same discipline the master prompt itself asks for
  in §39 ("do not attempt a giant one-shot implementation without
  verification").
- **Automated testing carries the verification weight, not manual
  claims** — this is the user's own explicit standard from the prior
  two initiatives. Vitest for component/logic-level work, Playwright
  for real browser-driven end-to-end proof (`docker compose up` first,
  then `npx playwright test` for real, pasting actual pass/fail counts
  into the log). Re-run the existing `frontend/tests/` suite
  periodically too — the old frontend must stay untouched and
  operational; prove it, don't assume it.
- **Find real bugs by running things.** Both prior initiatives' own
  logs are full of exactly this pattern — real bugs found live by
  actually executing code and tests, not by inspection, each one
  diagnosed to a real root cause and fixed (or the test fixed, if the
  test's own assumption was wrong). Hold this work to the same
  standard.
- **Reuse existing backend behavior, never reinvent it.** The API
  layer (NF2) should mirror what `backend/features/*/api.py` actually
  does — validation rules, required-field logic (including the
  roster-origin relaxed-required path from the ER Live-Roster
  Redesign), status/error shapes. Don't invent new client-side
  validation that diverges from the server's.
- **Air-gapped constraints are real, not aspirational** — confirm no
  Google Fonts/CDN/external requests fire from the built app, not just
  that the source doesn't reference one.
- **Ask before, not after**, on anything the master prompt itself
  flags as not-to-assume-silently (§35): changing API meaning,
  workflow, patient state transitions, departure semantics, or
  database structure. Everything else — a strong, sensible,
  documented assumption, per the master prompt's own "Good Assumption
  Policy," and keep moving.

## When you're done (or need to stop)

Update the tracking doc's status table and log to reflect exactly
where things stand, so the user can see real state by opening the
file. Report back with a summary of what's real and verified (test
runs, a working build, real screenshots) vs. what's still open —
nothing claimed without evidence backing it, matching the standard the
user has already seen twice from this project's other two initiatives.
