# Kickoff prompt — ER UI Architecture Redesign

Paste everything below the line into a fresh Claude Code session,
opened on this repo (`C:\Users\it\Documents\HCopilot\HCopilot`).

---

I want you to build the ER UI Architecture Redesign for HCopilot — a
three-page UI overhaul, already fully planned and sliced by a prior
session. Read these two files first, in full, before doing anything
else:

1. `docs/development/ER UI Architecture Redesign/0. Slicing Task
   Table.md` — the live tracker: background, how this relates to
   already-finished backend work, 3 real open questions the prior
   session found (with recommended defaults), confirmed decisions,
   full slice breakdown (UI-A/UI-B/UI-C), testing design, status
   table.
2. `docs/development/ER UI Architecture Redesign/source/UI Decision we
   Need to decide.md` — the original design decision doc this all
   comes from, plus the 3 reference mockups in `source/mockups/`
   (treat them as layout/interaction references, not literal pixel
   specs — HCopilot has its own design system).

Also skim `docs/development/ER Live Roster Redesign/0. Slicing Task
Table.md` — that's the branch (`er-live-roster-redesign`, already
merged/current work, ER1–ER12 all DONE) whose UI this redesign
replaces. Don't rebuild its backend (roster fetch, relaxed-required
create, shared discharge, bedless endpoint, 2-min poll-diff safety
net) — it's done and tested. You're changing how it's *surfaced*, not
what it does.

## Before writing any code

The slicing doc's own "Real conflicts found" section lists 3 genuine
open questions (create-timing on roster pick, per-ward vs. catch-all
waiting lanes, the definition of "handled" for the 5-minute waiting
alert) — each with a recommended default already reasoned through. Ask
the user directly (one AskUserQuestion call, all 3 at once) before
building anything that depends on them. If the user tells you to work
fully autonomously and make the call yourself (as happened in the
prior ER Live-Roster Redesign session), use the documented
recommendations and write down which one you picked and why in the
tracking doc's log — don't build against an unstated assumption
either way.

## How to work

- **Branch**: create a new branch off the current one before touching
  anything (check `git status`/`git branch` first — confirm you're
  branching from the real current state, not stale). Follow the same
  git discipline as the prior session: never commit unless the user
  explicitly asks, even under full autonomy.
- **Slice by slice**, in the order the tracking doc suggests
  (UI-A → UI-B → UI-C), updating the doc's status table and appending
  a dated log entry to its "Live status log" section (add one if it
  doesn't exist yet, matching the ER Live-Roster Redesign doc's
  format) after each slice actually lands — not in a batch at the
  end. This is the whole point of the document: the user wants to
  open this file and see real progress, not a retrospective summary.
- **Automated UI testing, not manual claims.** This is almost entirely
  frontend work — Playwright is the primary verification tool, the
  same way it was for the ER Live-Roster Redesign
  (`frontend/playwright.config.js`, `frontend/tests/`, the existing
  `login`/`gotoPatients`/`gotoBedsDisplay` helpers). For every slice
  that touches the UI: write or extend a spec, run
  `npx playwright test` for real (`docker compose up` must be running
  first), and paste the real pass/fail counts into the log — not a
  claim that it "should work." Re-run the *entire* suite after each
  slice, not just the new spec (see the tracking doc's Testing design
  section for exactly why — this wave touches pages the existing 11
  specs already cover).
- **Find real bugs by running things, not by reading code.** The prior
  session's own log (in the ER Live-Roster Redesign doc) is full of
  exactly this pattern — a cross-worker test race, a collapsed panel
  never expanded before a click, a wrong test assumption, a hardcoded
  past date, a real scheduler/monkeypatch interaction — all caught by
  actually executing the suite, not by inspection. Hold yourself to
  the same standard: when something fails, find the real root cause
  and fix it (or fix the test, if the test's own assumption was
  wrong), and write down which it was. Don't paper over a red run.
- **Reuse existing code and patterns aggressively.** Concrete examples
  already identified in the slicing doc: UI-A4 should re-host the
  existing ISBAR accordion markup/JS rather than rebuild it; UI-B2
  should restructure `bed_manager.get_all_beds()`'s existing
  ward-grouping rather than write new grouping logic; UI-C2 should
  extract `openPatientDetailsModal()`'s existing render logic into a
  shared function rather than duplicate it for the new preview pane.
  Read the actual current code before assuming something needs to be
  built from scratch.
- **Name real gaps and scope decisions explicitly in the log, the way
  the prior session did** — e.g. if UI-C5's filter audit finds the
  backend doesn't support a filter the doc wants, say so and decide
  (build it, or scope it out for this pass) rather than silently
  dropping it.

## When you're done (or need to stop)

Update the tracking doc's status table and log to reflect exactly
where things stand — DONE slices, IN PROGRESS, blocked, whatever's
true — so the user can see real state by opening the file, the same
way they did for the ER Live-Roster Redesign. Report back with a
summary of what's real and verified vs. what's still open, matching
the standard the prior session held itself to: nothing claimed without
a command/test run backing it.
