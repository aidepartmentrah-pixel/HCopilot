# HCopilot New Frontend — Master Implementation Prompt

## Mission

Build a **completely new HCopilot frontend from scratch**.

This is **not** a redesign-in-place of the existing frontend.
Do **not** progressively restyle, patch, or refactor the old HTML/JavaScript UI into the new one.

The existing frontend must remain operational and untouched as a fallback/reference implementation while the new frontend is developed in parallel.

The goal is to create a new frontend that:

- Uses the **same existing backend and database**
- Preserves existing business logic and API behavior
- Replaces the weak visual structure and inconsistent styling of the current frontend
- Uses a professional, coherent, modern UI system
- Is suitable for real hospital/ER use
- Is maintainable and strongly typed
- Supports Arabic/English content correctly
- Can later become the primary HCopilot frontend after feature parity and testing

The existing frontend is useful only as:

1. A source of current workflows and available functionality
2. A reference for API behavior
3. A fallback application during migration

It is **not** a visual design source that should be copied.

---

# 1. Core Working Principle

When requirements are not explicitly specified, **make good product and UI assumptions that fit a modern hospital application**.

Do not stop development for every small visual or structural uncertainty.

Use professional judgment.

Prefer assumptions that are:

- Modern
- Clinically appropriate
- Visually restrained
- Consistent with the rest of the application
- Easy to understand without training
- Easy to maintain in code
- Safe for repeated hospital use
- Appropriate for desktop-first workflows
- Compatible with Arabic and English
- Consistent with the selected Indigo + Slate design direction

If multiple reasonable solutions exist:

1. Choose the cleanest and most professional option.
2. Prefer established SaaS / healthcare UX patterns.
3. Prefer consistency over novelty.
4. Avoid decorative experimentation that hurts usability.
5. Document important assumptions briefly in code comments or project documentation.
6. Only ask for clarification when the decision could materially change workflow, patient safety, data meaning, or backend behavior.

The target is **not** a generic template.
The target is a polished, modern, coherent HCopilot product.

---

# 2. Non-Negotiable Architecture Rule

The new frontend must run **in parallel** with the old frontend.

Conceptually:

```text
                         ┌────────────────────┐
                         │ Existing Frontend  │
                         └─────────┬──────────┘
                                   │
                                   │
┌──────────────────┐               │
│ Existing Backend │◄──────────────┤
└──────────────────┘               │
                                   │
                         ┌─────────┴──────────┐
                         │ New Frontend       │
                         │ React + TypeScript │
                         └────────────────────┘
```

Requirements:

- Do not remove or rewrite the old frontend.
- Do not break the old frontend.
- Do not change backend behavior merely to simplify frontend development unless a real backend issue is discovered and documented separately.
- The old and new frontends should be able to run at the same time on separate ports/services.
- Both should connect to the same backend API.
- Keep environment configuration separate and explicit.
- The new frontend should have its own build and runtime configuration.

A reasonable structure would be:

```text
backend/
frontend-old/
frontend-new/
```

or equivalent.

During development, something conceptually similar to:

```text
Old frontend: http://server:8082
New frontend: http://server:8083
Backend API: shared
```

Exact ports may differ depending on the existing project.

---

# 3. Required Technology

Use:

- **React**
- **TypeScript**
- **Vite**
- **React Router**
- **TanStack Query** for server/API state
- **React Hook Form** for complex forms
- **Zod** for frontend schema validation where appropriate
- **Lucide React** for icons
- **CSS variables/design tokens**
- A clean CSS architecture using either:
  - CSS Modules, or
  - a well-structured global/component stylesheet system

Do not introduce a large UI framework merely to make development easier if it forces the app into a generic template appearance.

A small headless component library may be used if useful, but the visual system must remain custom and coherent.

Recommended optional choices:

- TanStack Table for complex History/admin tables
- date-fns for dates
- Vitest + React Testing Library for unit/component tests
- Playwright for end-to-end and visual workflow tests

Avoid unnecessary dependencies.

---

# 4. Frontend Project Structure

Use a maintainable feature-oriented structure, for example:

```text
src/
├── app/
│   ├── router/
│   ├── providers/
│   └── App.tsx
│
├── api/
│   ├── client.ts
│   ├── patients.ts
│   ├── er.ts
│   ├── beds.ts
│   ├── history.ts
│   ├── statistics.ts
│   └── settings.ts
│
├── types/
│   ├── patient.ts
│   ├── er.ts
│   ├── bed.ts
│   ├── isbar.ts
│   └── api.ts
│
├── components/
│   ├── layout/
│   ├── navigation/
│   ├── forms/
│   ├── tables/
│   ├── feedback/
│   ├── patient/
│   ├── beds/
│   └── charts/
│
├── features/
│   ├── isbar/
│   ├── live-er/
│   ├── history/
│   ├── statistics/
│   └── settings/
│
├── hooks/
├── utils/
├── styles/
└── design-system/
```

The exact structure may be improved if a better TypeScript architecture is justified.

---

# 5. Global Design Direction

The selected visual direction is:

# **Indigo + Slate**

The new frontend should feel:

- Professional
- Calm
- Clinical
- Modern
- Structured
- Trustworthy
- Premium without looking decorative
- Similar in maturity to polished Microsoft/enterprise healthcare software
- Clear enough for repeated use in a busy ER

It must **not** look:

- Like a student dashboard
- Like a Bootstrap admin template
- Like a page filled with emoji
- Like independent screens designed by different developers
- Overly colorful
- Cartoonish
- Excessively rounded
- Packed with unnecessary cards
- Visually noisy
- Cheap

---

# 6. Color System

Use semantic color roles.

Suggested starting palette:

```css
--brand-600: #4F46E5;
--brand-700: #4338CA;
--brand-50:  #EEF2FF;

--slate-950: #0F172A;
--slate-800: #1E293B;
--slate-700: #334155;
--slate-500: #64748B;
--slate-300: #CBD5E1;
--slate-200: #E2E8F0;
--slate-100: #F1F5F9;
--slate-50:  #F8FAFC;

--surface: #FFFFFF;
--canvas: #F8FAFC;

--success: #16A34A;
--warning: #D97706;
--danger: #DC2626;
--critical: #B91C1C;
```

These are starting assumptions, not rigid values.
Minor tuning is allowed if it improves contrast and consistency.

### Important semantic rule

**Indigo = brand / selected / interactive / primary action**

Indigo does NOT mean:

- critical
- healthy
- occupied
- waiting

Operational/clinical states use semantic colors.

Examples:

- Available: green
- Occupied: muted red/coral
- Waiting / no-bed: muted violet/slate-blue state
- Warning: amber
- Critical/abnormal: red
- Disabled: slate gray
- Selected: indigo outline/background accent

Never rely on color alone.
Use text labels and/or consistent icons.

---

# 7. Application Shell

Create a single reusable **AppShell**.

Every major page must use it.

The top bar must not be redesigned independently per page.

## Top Navigation Requirements

Recommended height:

```text
64–68 px
```

Suggested structure:

```text
[ HCopilot Logo ]

Home
ER
Patients
Tasks / Operations
Reports / Statistics
Resources / Settings

                          [ Global Search ]
                          [ Notifications ]
                          [ Avatar ]
                          Jamie Smith, RN
                          Emergency Department ▾
```

Exact labels should reflect real available modules.

Rules:

- Same height on every page
- Same spacing
- Same logo dimensions
- Same active-state style
- Same search placement
- Same user area
- Same hover behavior
- Same icon family
- Sticky top navigation is preferred
- Do not use random page-specific controls inside the global navbar

The navbar should be visually strong but not oversized.

---

# 8. Page Canvas

Do not recreate the old full purple/blue page background.

Use:

- light neutral canvas
- white surfaces
- subtle borders
- restrained shadows
- indigo only where meaningful

The product should visually read as:

```text
Brand shell
↓
Neutral workspace
↓
Meaningful content
```

not:

```text
Purple background
White box
Purple gap
White box
Purple gap
White box
```

---

# 9. Icons

Use **Lucide React** as the primary icon set.

Never use emoji as production UI icons.

Avoid:

```text
🏥 📋 👤 🟢 🔴 🌡 💓 🫁 😣 🏠
```

as UI components.

Icons should exist only when they improve recognition.

Good usage:

```text
Search icon + Search field
Bed icon + Bed 301
Pencil icon + Edit
Trash icon + Delete
Bell icon + Notifications
User icon + Empty patient state
```

Bad usage:

```text
icon before every title
icon before every metric
icon before every sentence
icon in every table cell
icon purely as decoration
```

Recommended approximate sizes:

```text
16–18 px  compact controls
18–20 px  navbar
20–22 px  meaningful section/object icon
24–32 px  empty state or major object only
```

Keep stroke weight consistent.

---

# 10. Typography

Typography should carry most of the hierarchy.

Recommended:

- **Inter** for Latin/English interface text
- **Noto Sans Arabic** or another professional, compatible Arabic family for Arabic content

Bundle required fonts locally for the air-gapped environment where necessary.

Suggested scale:

```text
Page title:          28–32 px
Major section:       20–22 px
Card/section title:  16–18 px
Standard body:       14–15 px
Form label:          12–13 px
Metadata:            12–13 px
KPI value:           26–32 px
```

Do not create random font sizes per page.

Patient names should remain readable and important.

Metadata must be visually secondary.

---

# 11. Spacing System

Use a consistent spacing scale.

Recommended:

```text
4
8
12
16
24
32
48
```

Avoid arbitrary spacing values unless there is a clear layout reason.

All pages should feel related through:

- consistent horizontal margins
- consistent section spacing
- consistent card padding
- consistent table row height
- consistent form field height

---

# 12. Cards and Surfaces

Do not wrap everything in cards.

A card should represent a meaningful conceptual unit.

Use cards for:

- patient summary
- ward
- ISBAR section
- chart
- KPI
- preview/detail record

Do not use cards for:

- every line
- every label
- every action
- page title container
- entire page inside another card without need

Avoid:

```text
page card
  card
    card
      card
```

Keep nesting shallow.

Use:

- subtle border
- subtle shadow
- moderate radius
- clean white background

Avoid excessive shadows and overly pill-shaped components.

---

# 13. Buttons

Establish button hierarchy.

## Primary

Use for the main page/section action.

Examples:

- Start ISBAR
- Assign Bed
- Add Bed
- Save Changes

## Secondary

Examples:

- Save Draft
- Refresh
- Cancel
- Export

## Tertiary / Ghost

Examples:

- View
- More
- Expand

## Destructive

Examples:

- Delete
- Reset
- Remove

Do not show several equally prominent primary buttons in one area.

Destructive actions must be visually distinct and require confirmation where appropriate.

---

# 14. Forms

All forms should share:

- same input height
- same label style
- same focus state
- same error state
- same disabled state
- same required-field behavior
- same spacing

Required fields should not rely on red text everywhere.

Use clear labels and validation messages.

Disabled/read-only/API-populated fields must be visually understandable.

Do not make read-only data look editable.

---

# 15. Tables

Tables must be designed as reusable components.

Support:

- sticky headers where useful
- sorting
- filters
- pagination
- clear selected row state
- empty state
- loading state
- error state
- responsive overflow strategy
- accessible keyboard interactions where feasible

Avoid giant row heights unless the table is a master-detail list.

Tables are preferred for dense retrieval/admin workflows.

Cards are preferred for operational objects.

---

# 16. Page Header Grammar

Every primary page should follow one consistent pattern:

```text
Page Title
Short explanatory subtitle                           [ page actions ]
```

Do not place the page title inside a large decorative card.

Examples:

```text
ER ISBAR Entry
Create and manage structured handovers               [ optional action ]

Live ER
Monitor current patient placement                    [ Refresh ]

History
Search and review previous ER stays                  [ Export ]

Statistics
ER performance and patient-flow analytics            [ Date ] [ Refresh ]

Settings
Manage application configuration
```

---

# 17. UI States

Every major component/page must deliberately define:

- loading
- loaded
- empty
- error
- API unavailable
- disabled
- selected
- unselected
- no permission where relevant

Do not leave blank white areas while data is loading.

Use skeletons sparingly.

Error states should explain what failed and what the user can do.

---

# 18. Accessibility and Clinical Usability

Aim for WCAG AA contrast where practical.

Requirements:

- visible keyboard focus states
- buttons must have labels/tooltips where icon-only
- semantic HTML
- form labels linked to controls
- status is not communicated only through color
- adequate click/touch target sizes
- avoid tiny text
- avoid subtle low-contrast controls
- avoid flashing UI

For urgent attention states, prefer:

- border emphasis
- badge
- small warning marker
- background tint

Avoid aggressive blinking/flashing unless explicitly required later.

---

# 19. Arabic / RTL Requirements

Arabic patient names and Arabic content are a first-class requirement.

Do not treat Arabic support as an afterthought.

Requirements:

- correct UTF-8 handling
- Arabic names render properly
- mixed Arabic/English rows remain visually stable
- use `dir="auto"` where appropriate for user-generated/name content
- test both Arabic and English patient names
- ensure numbers and IDs remain understandable inside mixed-direction content
- the overall app may remain LTR unless full RTL mode is explicitly introduced later

Components must not break when Arabic text is longer than English equivalents.

---

# 20. Page A — ER ISBAR Entry

This page has a locked architectural decision.

## Purpose

Answer:

> Who am I documenting now, and what is their ISBAR information?

## Layout

Use two primary areas:

```text
┌─────────────────┬───────────────────────────────────────┐
│ Live ER Roster  │ ISBAR Workspace                       │
│                 │                                       │
│ patient rows    │ patient identity / empty state        │
│                 │ ISBAR sections                        │
│                 │                                       │
└─────────────────┴───────────────────────────────────────┘
```

Recommended live roster width:

```text
320–360 px
```

Remaining width belongs to ISBAR.

## Before Patient Selection

The ISBAR form should be visible but disabled.

Show a calm empty/locked state:

> Select a patient from the Live ER Roster to begin ISBAR entry.

The user should understand what will happen next.

## Patient Selection

Clicking a roster row should:

1. select the patient
2. start/open the HCopilot encounter as required by current backend workflow
3. load available patient information
4. clearly show active patient identity
5. enable the form

Do not require an unnecessary modal confirmation by default.

## Patient Identity

After selection, show a clear identity area with:

- name
- age
- gender
- arrival time
- patient/visit identifier as needed
- change patient action

The current patient must be impossible to miss.

## ISBAR Sections

Keep the six structured sections:

1. Patient & Arrival
2. Initial Vital Signs
3. Situation
4. Background
5. Focused Assessment
6. Recommendation & Handover

Accordions are acceptable.

The accordion component must be professionally styled and reusable.

## Roster

Use rows, not decorative cards.

Each row may include:

- arrival time
- patient name
- age/gender
- short chief complaint
- acuity badge

The entire row should be selectable.

## Fallback Entry

Hospital Directory Search / Manual Entry remain secondary fallback methods.

Do not make them visually compete with the Live ER Roster.

Use a secondary pattern such as:

```text
Can't find the patient?
Search Hospital Directory · Manual Entry
```

---

# 21. Page B — Live ER Board

This page also has a locked architectural direction.

## Purpose

Answer:

> Where are the active ER patients right now?

and:

> Which beds are available, which are occupied, and which active patients currently have no bed?

## Core Principle

Use a **unified placement-card family**.

The current placement state should feel like a state change of the same ER system, not two unrelated modules.

## Shared Card Geometry

Bed-assigned objects and no-bed patient objects should use:

- same width
- same height
- same radius
- same padding
- same typography hierarchy
- same status location
- same action placement

## Visual States

### Available Bed

- bed icon
- bed number
- Available label
- green semantic styling

### Occupied Bed

- bed icon
- bed number
- Occupied label
- patient identity
- muted red/coral state

### Patient Without Bed

- seated-person/chair icon
- patient identity
- waiting/unassigned label
- acuity
- relevant short details
- visually part of the same card family

Use a professional seated-person/chair SVG icon.
Do not use emoji.

## Board Structure

Use horizontal lanes/groups.

Possible examples:

```text
Recovery Room
[ Bed 101 ] [ Bed 102 ] [ Bed 103 ] [ ... ]

Section A
[ Bed 201 ] [ Bed 202 ] [ Waiting Patient ] [ Bed 204 ] ...

Section B
[ Bed 301 ] [ Bed 302 ] [ Waiting Patient ] ...
```

A dedicated waiting/no-bed lane may also be used if operationally clearer.

Use good judgment based on current backend data.

## Summary

Keep summary metrics compact.

Prefer approximately:

- Occupied
- Available
- Without Bed
- Waiting Above Threshold

Do not consume a large portion of the page with six or seven oversized KPI cards.

## Bed Assignment

Bed assignment should be obvious and fast.

Bed occupation time should be handled according to the existing workflow/backend rules rather than manually typed as part of initial ISBAR entry.

## Soft Departure

When HCopilot soft departure occurs, remove the patient from the active Live ER interface immediately.

Backend/API reconciliation remains separate from frontend presentation.

---

# 22. Page C — History

This architecture is also decided.

## Purpose

Answer:

> What happened during previous ER stays?

## Base Layout

Use:

```text
Search / Filters
─────────────────────────────────────────────────────────
History Table | Resizable Record Preview
```

The table is the primary navigation/retrieval surface.

## Search / Filters

Support useful filters such as:

- patient name
- patient ID
- stay/visit ID
- date range
- bed
- acuity
- status

Only include filters supported by actual data/backend behavior.

## Table

Potential columns:

- Patient
- Stay ID
- Arrival
- Departure
- Bed
- Acuity
- Vital summary
- Flags
- Status
- Actions

Use good assumptions to avoid an unnecessarily wide table.

## Record Preview

Selecting a row opens a right-side preview panel.

The preview divider must be horizontally resizable.

Default approximate split:

```text
History list: 60–65%
Preview:      35–40%
```

Use sensible minimum widths.

The user should be able to:

- click Patient A
- click Patient B
- click Patient C

without navigating away from the history list.

## Preview Content

Include:

- patient summary
- arrival/departure
- bed
- acuity
- status
- ISBAR section summary
- vital signs where available

## Open Full Record

The preview must contain:

```text
Open Full Record
```

This opens a full-width detailed record page.

Use the full view for:

- deep inspection
- long content
- editing
- print/export if supported

The preview is optimized for browsing.

## History Is Not Analytics

Do not add KPI cards merely to fill space.

History is primarily retrieval and review.

---

# 23. Statistics

The Statistics page should remain analytical, but its visual hierarchy must be rebuilt professionally.

## Purpose

Answer questions about:

- ER patient flow
- wait times
- length of stay
- occupancy
- acuity
- arrival patterns
- clinical summaries where appropriate

## KPI Strategy

Do not create seven equally important KPI cards across the top.

Select approximately 4–5 primary KPIs.

Secondary metrics can appear in smaller supporting areas.

## Chart Grid

Use a consistent chart layout.

Example:

```text
[ Wait Time Distribution ] [ Length of Stay ]
[ Acuity Breakdown       ] [ Arrivals by Hour ]
[ Top Complaints         ] [ Current Vitals ]
```

Use consistent:

- chart card padding
- chart title style
- axis typography
- legend location
- tooltip style
- empty states

## Color

Do not color metrics arbitrarily.

Use semantic color only when a value is known to be:

- good
- warning
- critical

Otherwise use neutral/brand visualization colors.

ESI categories may use their clinical category colors where meaningful.

---

# 24. Settings

Settings is not an operational dashboard.

Do not copy the old horizontal list of many tiny settings tabs.

## Layout

Use a settings sidebar/navigation pattern:

```text
┌──────────────────┬─────────────────────────────────┐
│ Settings Nav     │ Settings Content                │
│                  │                                 │
│ Resources        │                                 │
│   Beds           │                                 │
│   Doctors        │                                 │
│   Nurses         │                                 │
│   Wards          │                                 │
│                  │                                 │
│ System           │                                 │
│   Scheduling     │                                 │
│   Data           │                                 │
│   Accounts       │                                 │
│                  │                                 │
│ Danger Zone      │                                 │
│   Reset          │                                 │
└──────────────────┴─────────────────────────────────┘
```

Exact categories may be adjusted according to existing functionality.

## Warning Design

Do not permanently consume a large portion of the page with a dramatic restricted-area banner.

Use a restrained informational warning.

Use stronger confirmation warnings only when a user performs a destructive/high-risk action.

## CRUD Screens

For example, Bed Management should look like an administration tool:

```text
Beds

Search   Ward   Status   Type                         Add Bed

--------------------------------------------------------------
Bed Number | Status | Type | Ward | Actions
```

Do not place unnecessary analytics cards above every admin table.

Operational analytics belong in Live ER / Statistics.

Configuration belongs in Settings.

---

# 25. Navigation / Responsibility Separation

Preserve clear conceptual separation.

The main product areas should answer different questions.

## ISBAR

> Who am I documenting?

## Live ER

> Where are my active patients?

## History

> What happened previously?

## Statistics

> How is the ER performing?

## Settings

> How is the application configured?

Do not merge unrelated responsibilities into one page simply because the old frontend did so.

---

# 26. Responsive Strategy

Primary target is desktop hospital workstations.

Design primarily for widths such as:

```text
1366
1440
1600
1920
```

The app must remain usable on smaller desktop/laptop widths.

Mobile-first design is not required unless the project already has a real mobile requirement.

For narrow screens:

- avoid breaking data
- allow appropriate horizontal scrolling for dense tables
- collapse noncritical controls intelligently
- never hide critical patient identity or actions

---

# 27. API Integration

Create a proper typed API layer.

Do not scatter `fetch()` calls throughout React components.

Use a centralized client.

Example:

```text
api/client.ts
api/er.ts
api/patients.ts
api/beds.ts
api/history.ts
```

Define TypeScript response types.

Use TanStack Query for:

- fetching
- caching
- refresh
- loading
- error handling
- invalidation after mutations

The frontend should tolerate:

- nullable fields
- missing optional data
- API downtime
- slow API responses
- empty result sets

Do not invent backend data silently.

---

# 28. Environment Configuration

Provide clear environment configuration for the new frontend.

Example:

```env
VITE_API_BASE_URL=http://150.50.10.30:PORT
VITE_APP_NAME=HCopilot
```

Exact variables should reflect actual architecture.

Do not hardcode production backend URLs inside components.

The new frontend must have a separate `.env`/deployment configuration from the existing frontend.

---

# 29. Air-Gapped Deployment

HCopilot runs in an offline / air-gapped environment.

Requirements:

- all runtime assets must be local
- no Google Fonts at runtime
- no CDN icon dependencies
- no external JavaScript
- no external analytics
- no internet-required components

All dependencies must be bundled at build time or transferred through the established offline deployment process.

The production build must work without internet access.

---

# 30. Testing Requirements

The new frontend should not be considered complete merely because pages render.

## Unit / Component Tests

Use:

- Vitest
- React Testing Library

Test meaningful logic/components.

## End-to-End Tests

Use Playwright.

At minimum cover:

### ISBAR

- page loads
- roster loads
- form disabled without selection
- selecting patient activates correct patient
- sections can be completed
- save/submit workflow

### Live ER

- beds render
- states render correctly
- no-bed patients render
- assignment action works
- departure action works

### History

- search/filter
- row selection
- preview opens
- preview resize if feasible to automate
- open full record

### Settings

- tables render
- filters work
- CRUD dialogs/actions behave correctly

## Visual Regression

Where practical, capture screenshots for major screens to protect the design system against accidental degradation.

---

# 31. Loading / Error Patterns

Create reusable UI components for:

```text
LoadingState
EmptyState
ErrorState
InlineError
ConfirmDialog
Toast
Skeleton
```

Do not use browser `alert()` / `confirm()` for production workflows unless absolutely unavoidable.

Use a consistent notification/toast system.

---

# 32. Modals and Drawers

Use modals only when the task genuinely benefits from temporary focus.

Good uses:

- confirm delete
- quick small edit
- dangerous action confirmation
- compact administrative create/edit

Avoid putting entire large clinical records inside modals.

Use drawers for preview/contextual content.

Use full pages for deep workflows.

---

# 33. Interaction Quality

Use subtle interaction feedback:

- hover
- focus
- selected
- pressed
- disabled
- loading

Animations should be short and restrained.

Recommended:

```text
120–200 ms
```

Avoid:

- bouncing
- exaggerated transitions
- decorative motion
- flashing cards
- unnecessary gradients
- glassmorphism
- neon effects

This is clinical software.

---

# 34. Content Quality

Do not use vague labels.

Prefer:

```text
New ISBAR Entry
Live ER
History
Assign Bed
Change Bed
Depart Patient
Open Full Record
Add Bed
```

Avoid unclear labels such as:

```text
Addition
Action
Manage
Data
More
```

unless the context makes their meaning obvious.

Button labels should describe the result of clicking them.

---

# 35. Good Assumption Policy

During implementation, proactively make sensible design assumptions.

Examples of acceptable assumptions:

- choosing a consistent icon when none is specified
- deciding reasonable card padding
- choosing a clean empty state
- selecting appropriate default table density
- deciding that a secondary action should be a ghost button rather than a primary button
- choosing whether a filter belongs in a toolbar
- using a standard confirmation dialog for destructive actions
- making a preview panel default to 38% width
- using sticky table headers where records are long
- using a neutral skeleton for data loading

Do not block implementation for these.

Examples of decisions that **should not** be assumed silently:

- changing API meaning
- deleting a workflow
- changing patient state transitions
- changing departure semantics
- changing which data is authoritative
- inventing new clinical calculations
- changing database structure
- changing user permissions

For those, inspect the existing implementation/API and document uncertainty.

---

# 36. Do Not Copy Old UI Mistakes

Explicitly avoid carrying these old patterns into the new frontend:

- saturated purple background covering the entire page
- emoji used as UI icons
- multiple unrelated workflows on one page
- page titles inside oversized cards
- cards nested deeply inside cards
- excessive KPI cards on non-analytics pages
- vague actions such as "Addition"
- inconsistent icon sizes
- inconsistent spacing
- arbitrary colors
- every component using a different radius
- every page inventing its own header
- large decorative empty areas
- unnecessarily tiny text
- table pages that run endlessly without good pagination/filtering
- large permanent warning banners
- duplicate navigation systems
- clinical status colors used as decorative theme colors

---

# 37. Reusable Components Expected

Create reusable components rather than duplicating visual logic.

Examples:

```text
AppShell
TopNavigation
PageHeader
SearchInput
FilterBar
Button
IconButton
Badge
StatusBadge
Card
MetricCard
Accordion
DataTable
EmptyState
ErrorState
LoadingState
ConfirmDialog
Drawer
ResizablePanel
PatientIdentity
PatientRosterRow
PlacementCard
BedCard
WaitingPatientCard
VitalDisplay
ISBARSection
SettingsSidebar
```

Do not force abstraction prematurely, but repeated visual patterns should become shared components.

---

# 38. Design Tokens

Create a centralized token system.

At minimum:

```text
colors
spacing
radius
shadows
font sizes
font weights
control heights
z-index layers
transition durations
```

Example concept:

```css
:root {
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;

  --control-height-sm: 32px;
  --control-height-md: 40px;
  --control-height-lg: 44px;
}
```

Use tokens consistently.

---

# 39. Development Workflow

Proceed incrementally.

Recommended order:

1. Inspect backend/API and old frontend workflows
2. Scaffold new frontend
3. Build design tokens
4. Build AppShell
5. Build base components
6. Implement ER ISBAR Entry
7. Implement Live ER
8. Implement History
9. Implement Statistics
10. Implement Settings
11. Add remaining feature parity pages
12. Automated tests
13. Visual regression review
14. Production build/deployment
15. Compare old vs new frontend behavior
16. Only then consider switching default frontend

Do not attempt a giant one-shot implementation without verification.

---

# 40. Preserve Functionality While Improving Presentation

When rebuilding an existing feature:

1. Identify what the old frontend actually does.
2. Identify API calls and state transitions.
3. Preserve the behavior.
4. Re-express it in the new UI.
5. Test both normal and edge cases.

Never remove functionality merely because it looks visually inconvenient.

If an old UI control seems useless, verify its actual behavior before excluding it.

---

# 41. Documentation

Maintain concise frontend documentation covering:

- architecture
- folder structure
- API configuration
- design tokens
- reusable components
- development commands
- production build
- air-gapped deployment
- test commands
- major design decisions
- major assumptions

Do not over-document obvious code.

---

# 42. Definition of Done

The new frontend is ready for replacement consideration only when:

- core workflows have feature parity
- APIs behave correctly
- automated tests pass
- no serious console errors
- no runtime internet dependencies
- Arabic patient names display correctly
- key workflows pass Playwright tests
- visual system is consistent
- loading/error/empty states exist
- old frontend can still be used as fallback
- new frontend runs independently
- backend does not require unsafe changes
- the product feels like one coherent application

---

# Final Design Standard

The entire frontend should follow this rule:

> **Same shell, same visual language, different page architecture according to the job being performed.**

Consistency does **not** mean every page has the same cards.

It means:

- same application shell
- same typography
- same colors
- same buttons
- same icons
- same spacing
- same form behavior
- same table behavior
- same interaction quality
- same semantic state system

while:

- ISBAR is optimized for data entry
- Live ER is optimized for situational awareness
- History is optimized for retrieval
- Statistics is optimized for comparison and analysis
- Settings is optimized for precise administration

Use modern professional judgment throughout implementation.

When the specification does not dictate a small stylistic choice, **make a strong sensible assumption that fits this design system and continue** rather than producing an inconsistent placeholder or stopping unnecessarily for clarification.

The final result should look and behave like a mature hospital product, not like a collection of individually styled web pages.
