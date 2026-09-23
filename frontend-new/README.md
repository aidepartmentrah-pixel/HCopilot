# HCopilot — New Frontend (React Rewrite)

A ground-up rewrite of HCopilot's frontend in React + TypeScript + Vite,
running **in parallel** with the existing vanilla-JS frontend (`../frontend/`)
against the same backend and database. This is not a redesign of the old
frontend in place — the old frontend stays untouched as a fallback/reference
until this one reaches parity and is explicitly promoted.

Built in two waves. **NF0–NF9** (first wave) shipped the initial 6-page
rewrite (Home/ISBAR/Live ER/History/Statistics/Settings) with a working but
visually plain shell. **V2.0–V2.8** (second wave, this README's current
state) restored clinical/operational depth the first wave simplified too
aggressively, applied the real branded indigo/navy shell, added a 7th page
(Predictions), and rebuilt Statistics/Settings around proper analytics and
administration systems rather than each page's own ad hoc pattern.

Mission specs and live build trackers (dated log entry per slice, every real
bug/decision recorded as it happened — read these before assuming what's
built):
- First wave: `../docs/development/New Frontend (React Rewrite)/source/
  HCopilot_New_Frontend_Master_Prompt.md` /
  `../docs/development/New Frontend (React Rewrite)/0. Slicing Task Table.md`.
- Second wave: `../docs/development/New Frontend V2 (Feature Parity &
  Redesign)/source/11. New Stack Missing Functions.md` /
  `../docs/development/New Frontend V2 (Feature Parity & Redesign)/0. Slicing
  Task Table.md`.

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
│   ├── navigation/  # TopNavigation (branded shell, V2.0), GlobalSearch,
│   │                # NotificationBell, UserMenu
│   └── tables/      # DataTable (sort + pagination, headless via TanStack Table)
├── features/        # One folder per page — isbar/, live-er/, history/,
│                    # statistics/, settings/, predictions/, home/ — each
│                    # owns its own components/, hooks live in the shared
│                    # src/hooks/. statistics/ and predictions/ each keep
│                    # their pure aggregation/formatting logic in plain
│                    # top-level .ts files (chartData.ts, permissions.ts,
│                    # forecastChartData.ts, errorClassification.ts, …)
│                    # colocated with their own Vitest tests, separate from
│                    # the React components that consume them.
├── hooks/           # TanStack Query hooks, one file per domain
├── design-system/   # tokens.css — the single source of design tokens
├── styles/          # fonts.css (self-hosted @font-face) + fonts/
└── utils/           # small shared helpers (e.g. humanize(), initialsOf(),
                       # formatClinicalDate())
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

Two additive extensions from the V2 wave, neither renaming nor retuning
anything above:
- **`--shell-*`** (V2.0) — the branded indigo/navy top-bar layer
  (`--shell-bg`, `--shell-active-bg`, `--shell-text`, …), deliberately
  distinct from the neutral `--canvas`/`--surface` workspace tokens the
  rest of every page sits on. Never used outside `components/navigation/`.
- **`--chart-blue` / `--chart-teal`** (V2.5) — the only two genuinely new
  hues the Statistics/Predictions charting system needed for its
  restrained categorical palette; the palette's other three colors
  (indigo, violet, slate) reuse `--brand-600`/`--waiting`/`--slate-500`
  rather than duplicating them (`features/statistics/chartPalette.ts`).

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
statistics,directory,settings,predictions}.ts` — one module per backend
domain, each built from actually reading the corresponding
`backend/features/*/api.py` and its manager's row-shape method, not
guessed. `src/types/*.ts` mirrors those real shapes, including nullability
(a `Patient.gender` is genuinely optional because the backend's
`check_required_by_origin` validator allows a roster-origin stay to omit
it — the type isn't guessing, it's reading the same rule the server
enforces). `src/hooks/*.ts` wraps each domain in TanStack Query — one
query-key object per domain so cache invalidation targets stay consistent
across files.

`api/settings.ts` (V2.6) grew from Beds/Doctors/Nurses/Wards-only into five
real domains sharing that one file: `wardsApi`, `staffApi`,
`hospitalDirectoryApi`, `modelTrainingApi`, `modelFilesApi`, and a now
fully-typed `authApi.users` (previously loose — see below). `resetApi` was
**removed entirely**, not just unused — the UI it powered
(`DangerZone.tsx`, wired to the real `POST /api/reset/all`) was deleted in
V2.6 because the V2 spec explicitly forbids any reset/data-wipe control in
this frontend, hidden or otherwise.

One domain (`staff-stats`) is still deliberately left loosely typed
(`Record<string, unknown>`) — a real endpoint, confirmed to exist, not yet
consumed by a built page. Typing it precisely is deferred to whichever
future phase actually builds against it, per this project's own "audit
when you actually need it, not before" discipline (a pre-typed guess can
go stale before it's ever used). `auth`/`sections`/`settings_tabs` are now
fully typed and built (V2.6's Accounts & Permissions) — see "Permission
key compatibility" below for a real constraint on that domain specifically.

## Charting

**recharts** (V2.5) — chosen when Statistics needed real Bar/Line/Donut
charts instead of the first wave's repetitive horizontal-progress-bar
pattern, and reused as-is for Predictions' forecast chart (V2.7) rather
than introducing a second library. Reasoning, still valid: React-native
SVG rendering (no canvas/CDN runtime dependency), first-class TypeScript
types, and it ships as a plain npm package Vite bundles locally like any
other dependency — satisfying the air-gapped requirement by construction
rather than needing special-casing. `e2e/airgapped.spec.ts` visits every
chart-bearing page and asserts zero external network requests, not just
that the source has no CDN `<script>` tag.

Shared chart infrastructure lives in `features/statistics/`
(`chartPalette.ts`'s categorical palette, `components/ChartTooltip.tsx`,
`components/AnalyticsCard.tsx`'s Bar/Line/Donut/Table view-switching
system) and is reused by Predictions rather than duplicated — Predictions
keeps only what's genuinely forecast-specific (the historical/forecast
line-connection technique, the boundary marker, production-model
metadata). Vite/Rollup automatically factors recharts into one shared
chunk across both pages' lazy-loaded routes, so it's downloaded once, not
twice.

## Permission key compatibility

`UserAccount.sections` / `.settings_tabs` / `.statistics_tabs` (V2.6's
Accounts & Permissions) are comma-separated key strings **shared with the
old frontend's own permission enforcement** — `frontend/js/auth.js` reads
these exact same fields off the same `Users` table to hide its own nav.
`features/settings/permissions.ts` therefore works only with real,
confirmed key vocabulary (audited from `users_manager.py`'s
`ALL_SECTIONS`/`ALL_SETTINGS_TABS` constants plus a live data read that
surfaced `patient-history`, a real in-use key missing from that constant)
— inventing new key strings here would silently break the old frontend's
nav gating for any account both frontends share. If a future page needs a
new gated capability, extend this real key vocabulary deliberately, don't
invent a parallel one.

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
  backend/database (`docker compose up` first). One spec file per page —
  `shell.spec.ts` (the branded shell, byte-identical across every route),
  `home.spec.ts`, `isbar*.spec.ts`, `live-er*.spec.ts`,
  `history*.spec.ts`, `statistics.spec.ts`, `settings.spec.ts`,
  `predictions.spec.ts` — plus `rtl.spec.ts` (real Arabic data, not
  synthetic fixtures), `airgapped.spec.ts` (real network-blocking, visits
  every chart-bearing page), `visual-regression.spec.ts` (baseline
  screenshots for all major screens, masked over anything time-dependent
  or genuinely-live ER data).

## Known, named scope gaps

Not silently dropped — each is a real, bounded follow-up:

- **History's "Edit"** action isn't built — the old frontend reuses its
  existing log-patient edit modal; this rewrite has no equivalent yet
  (discharged-record editing is a real, separate manager/endpoint from the
  active-stay ISBAR form). The backend endpoint exists; only the frontend
  destination doesn't.
- **`staff-stats`** (`/api/statistics/staff-stats`) is a real, confirmed
  endpoint not yet consumed by any page — left loosely typed on purpose
  (see "API layer" above).
- **Settings → Integrations / Accounts & Permissions have no dedicated
  `settings_tabs` permission key** — the backend's real permission
  whitelist (`ALL_SETTINGS_TABS`) only covers Resources and Model
  Registry/Training, so anyone with general Settings access can currently
  reach both; `PermissionsEditor` surfaces this gap visibly rather than
  inventing keys the backend doesn't recognize. A real fix needs a backend
  schema change, not a frontend workaround.
- **`statistics_tabs`** granularity (old per-statistics-subtab permission
  keys: `patients`/`nurses`/`doctors`/`wards`/`daily`) has no equivalent in
  the redesigned single-page Statistics (V2.5) — there are no sub-tabs left
  to gate.
- **No frontend route/nav enforcement of `sections`/`settings_tabs`** —
  Accounts & Permissions (V2.6) can fully manage these real, shared
  permission fields, but nothing in `frontend-new` yet hides a nav item or
  blocks a route based on them (the old frontend does enforce them for its
  own nav). Backend authorization remains the real boundary either way; this
  is a UI-convenience gap, not a security one.
- **Predictions has one product** (Patient Flow) — the module/component
  architecture (`ForecastHorizonSelector`, `HistoricalForecastChart`,
  `PredictionMetadataPanel`, …) is built to hold Bed Demand/Wait
  Time/Length of Stay later without a rewrite, but no placeholder tabs
  exist for them since no real backend models exist for them yet.
- **ESI4's color** is `neutral` (slate), not the V2 spec's suggested
  light-green — an already-shipped, cross-product choice (`ACUITY_TONE` in
  `features/isbar/constants.ts`, reused by ISBAR/Live ER/History/
  Statistics) that predates the V2 spec's own §16; changing it now means
  touching four already-tested pages at once, deliberately deferred rather
  than done piecemeal.
- **Settings resource tables** (Beds/Doctors/Nurses/Wards) still have no
  search/filter toolbar — each table is fully functional (sort, paginate,
  CRUD) without one; a real, bounded follow-up if resource lists grow
  large enough to need it.
- **Visual-regression baselines** (`e2e/visual-regression.spec.ts`) mask
  whatever is time-dependent or live-data-driven per page (table bodies,
  placement cards, waiting-duration badges); Statistics masks its entire
  `main` region specifically, since its content changed the most across
  the V2 wave (V2.5's full redesign). Re-baselined for V2.8 — see this
  slice's log entry for the real diff-count/masking notes per page.
