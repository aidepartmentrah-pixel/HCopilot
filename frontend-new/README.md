# HCopilot — New Frontend (React Rewrite)

A ground-up rewrite of HCopilot's frontend in React + TypeScript + Vite,
running **in parallel** with the existing vanilla-JS frontend (`../frontend/`)
against the same backend and database. This is not a redesign of the old
frontend in place — the old frontend stays untouched as a fallback/reference
until this one reaches parity and is explicitly promoted.

Full mission spec: `../docs/development/New Frontend (React Rewrite)/source/
HCopilot_New_Frontend_Master_Prompt.md`. Live build tracker, with a dated log
entry per slice and every real bug/decision recorded as it happened:
`../docs/development/New Frontend (React Rewrite)/0. Slicing Task Table.md`.

## Architecture

```
Old frontend  (frontend/)      →  http://<host>:8082  →  nginx (static, same-origin /api proxy)
New frontend  (frontend-new/)  →  http://<host>:8083  →  nginx (static, same-origin /api proxy)
Backend       (backend/)       →  http://<host>:8090  →  shared by both frontends, unchanged
```

Both frontends call the **same backend**, same-origin, via a relative
`/api/...` path — nginx's `proxy_pass` handles this in production
(`nginx.conf`), Vite's own dev-server proxy does the same thing in
`npm run dev` (`vite.config.ts`). This was a deliberate choice over the
master prompt's literal `VITE_API_BASE_URL=http://host:PORT` example: Vite
env vars are inlined into the built JS bundle at build time, so baking a
site-specific backend IP into the build would force a distinct image build
per hospital site. The old frontend already solved this with an nginx
reverse proxy — this rewrite reuses that pattern rather than reintroducing
the problem. See `.env.example` for the full rationale and the
`VITE_API_BASE_URL` escape hatch if a future deployment ever needs a direct
cross-origin call instead (CORS is already open on the backend for exactly
that case).

## Folder structure

```
src/
├── app/            # AppProviders (QueryClient/Toast/Router), AppRouter (routes)
├── api/            # Typed fetch client (client.ts) + one module per domain
├── types/          # TypeScript types, one file per domain, audited against
│                    # the real backend models (backend/features/*/api.py)
├── components/
│   ├── ui/         # Button, IconButton, Badge, StatusBadge, Card, MetricCard
│   ├── forms/      # FormField, Input, Select, TextArea, Accordion,
│   │                # YesNoToggle, MultiSelectChips, SearchInput, FilterBar
│   ├── feedback/    # EmptyState, ErrorState, LoadingState, ConfirmDialog, Toast
│   ├── layout/      # AppShell, PageHeader, Drawer, ResizablePanel
│   ├── navigation/  # TopNavigation
│   └── tables/      # DataTable (sort + pagination, headless via TanStack Table)
├── features/        # One folder per page — isbar/, live-er/, history/,
│                    # statistics/, settings/, home/ — each owns its own
│                    # components/, hooks live in the shared src/hooks/
├── hooks/           # TanStack Query hooks, one file per domain
├── design-system/   # tokens.css — the single source of design tokens
├── styles/          # fonts.css (self-hosted @font-face) + fonts/
└── utils/           # small shared helpers (e.g. humanize())
```

## Design tokens

`src/design-system/tokens.css` — colors, spacing, radius, shadows, font
sizes/weights, control heights, z-index, transitions, all as CSS custom
properties. **Indigo + Slate** direction per the master prompt's own §5/§6.
Semantic status colors (`--success`/`--warning`/`--danger`/`--critical`/
`--occupied`/`--waiting`) are darkened from the master prompt's own §6
starting values — a real, computed WCAG AA contrast check (NF8.2) found the
originals failed at small badge/label text sizes; the master prompt's own
§6 explicitly allows this kind of tuning. Never reuse `--brand-*` for a
clinical/operational state — brand indigo means selected/interactive only.

## Components

Every component follows the same contract: CSS Modules (no global classes,
no styling library), `dir="auto"` by default on every text `Input`/
`TextArea` (Arabic content is a first-class citizen — §19), a required
`label` prop on every icon-only `IconButton` (no unlabeled icon buttons
anywhere in the app), loading/empty/error states via `DataTable`'s own
built-in handling rather than each page reinventing it. `DataTable` paginates
by default (`pageSize` prop, default 20; `pageSize={0}` opts a page out for
the rare case that genuinely needs every row visible at once) and accepts a
`defaultSort` — set it to something that puts a just-created row on page 1
(e.g. newest-arrival-first), not left at raw insertion order.

## API layer

`src/api/client.ts` — a small typed fetch wrapper (`ApiError` carries the
real HTTP status + body text). `src/api/{patients,er,beds,history,
statistics,directory,settings}.ts` — one module per backend domain, each
built from actually reading the corresponding `backend/features/*/api.py`
and its manager's row-shape method, not guessed. `src/types/*.ts` mirrors
those real shapes, including nullability (a `Patient.gender` is genuinely
optional because the backend's `check_required_by_origin` validator allows
a roster-origin stay to omit it — the type isn't guessing, it's reading the
same rule the server enforces). `src/hooks/*.ts` wraps each domain in
TanStack Query — one query-key object per domain so cache invalidation
targets stay consistent across files.

Two domains (`staff-stats`, most of `auth`/shifts/groups) are deliberately
left loosely typed (`Record<string, unknown>` / `unknown`) — real endpoints,
confirmed to exist, not yet consumed by a built page. Typing them precisely
is deferred to whichever future phase actually builds against them, per
this project's own "audit when you actually need it, not before" discipline
(a pre-typed guess can go stale before it's ever used).

## Commands

```bash
npm run dev        # Vite dev server, port 8083, /api proxied to localhost:8090
npm run build      # tsc -b && vite build → dist/
npm run preview    # serve the built dist/ on port 8083 (also /api-proxied)
npm run lint       # oxlint
npm run test       # Vitest (unit/component)
npm run test:e2e   # Playwright — requires `docker compose up` first (real backend)
```

`npm run test:e2e` runs against the **real** backend/database, same
convention as `frontend/tests/`'s own suite — `fullyParallel: false`,
`workers: 1` in `playwright.config.ts`, because `/api/patients/next-ids` is
a bare `max(existing)+1` with no locking; concurrent workers can race it.
This is the same fix `frontend/playwright.config.js` already had to make
for the identical reason — ported here rather than rediscovered.

Two real environment gotchas worth knowing if a future session hits them:
- **`vite preview` doesn't inherit `server.proxy`** — it's a separate Vite
  server config. `vite.config.ts` sets up `/api` proxying under both
  `server` (dev) and `preview` (what Playwright's e2e suite and the Docker
  image actually run) — if a future config change only touches one, e2e
  will silently start 404ing every API call.
- **A stale `frontend-new` process/container on port 8083 shadows a fresh
  one.** Playwright's `webServer.reuseExistingServer` (and Chromium's own
  disk cache) will happily keep serving an old build if something is
  already listening on 8083 — stop the Docker container (`docker compose
  stop frontend-new`) and any local `npm run preview`/`npm run dev`
  process before trusting a "the fix didn't work" result during local
  iteration. This bit two different NF phases in this project's own build
  history (see the tracking doc's NF1 and NF6 log entries).

## Production build & air-gapped deployment

`Dockerfile` — multi-stage: `node:24-alpine` builds, `nginx:1.27-alpine`
serves the static output + proxies `/api`. `docker-compose.yml`'s
`frontend-new` service is additive — it never modifies or replaces the
existing `frontend`/`backend`/`sqlserver` services.

All fonts are self-hosted (`src/styles/fonts/*.woff2` — Inter, mirrored
from the old frontend's own already-audited subset; Noto Sans Arabic,
fetched once at authoring time via Google Fonts' CSS2 API, never referenced
by URL at runtime). No CDN, no Google Fonts link, no external JS anywhere
in the built output — verified for real, not just by inspecting source:
`e2e/airgapped.spec.ts` blocks every non-`localhost` request at the network
layer and asserts none were even attempted, across both the app shell and
an Arabic-name-heavy page.

## Testing

- **Unit/component** (Vitest + React Testing Library): colocated with the
  component/hook/util it tests. Real logic — form validation, waiting-time
  calculation, pagination row counts, WCAG-relevant rendering (a "nothing
  recorded" empty state vs. a populated one) — never snapshot-only.
- **E2E** (Playwright, `e2e/*.spec.ts`): real Chromium against the real
  backend/database (`docker compose up` first). One spec file per page,
  plus `rtl.spec.ts` (real Arabic data, not synthetic fixtures),
  `airgapped.spec.ts` (real network-blocking), `visual-regression.spec.ts`
  (baseline screenshots for all 6 major screens, `maxDiffPixelRatio: 0.02`
  tolerance for genuinely-live ER data drift between runs).

## Known, named scope gaps

Not silently dropped — each is a real, bounded follow-up:

- **Settings**: only Resources (Beds/Doctors/Nurses/Wards) + Danger Zone
  are built. Patients (covered by this rewrite's own ISBAR/History pages),
  Scheduling, Data, and System tabs exist in the old frontend but belong to
  Flow Prediction/ML-training/dataset-admin modules already out of this
  rewrite's scope (same boundary NF1.3 drew for top-level nav).
- **Settings resource tables** have no search/filter toolbar yet (the
  master prompt's own §24 example shows one for Beds) — each table is
  fully functional (sort, paginate, CRUD) without one.
- **History's "Edit"** action isn't built — the old frontend reuses its
  existing log-patient edit modal; this rewrite has no equivalent yet
  (discharged-record editing is a real, separate manager/endpoint from the
  active-stay ISBAR form).
- **Deeper `/api/statistics/*` endpoints** (`staff-stats`) and most of
  `/api/staff/shifts`, `/api/staff/groups`, `/api/auth/users` are real,
  confirmed-to-exist, but not yet built into a page — types left loose on
  purpose (see "API layer" above).
