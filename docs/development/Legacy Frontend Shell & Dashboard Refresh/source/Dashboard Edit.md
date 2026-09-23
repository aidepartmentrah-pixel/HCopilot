#### The Dashboard / Main Page

```
# HCopilot New Frontend — Dashboard / Home Page UI Proposal

## Objective

Replace the current Home page, which is essentially a four-shortcut launcher, with a real **HCopilot Emergency Department operational dashboard**.

The page should immediately answer:

> What is happening in the ER right now?

The Dashboard must feel alive, useful, clinical, and consistent with the new HCopilot visual identity.

This is a frontend redesign of the Dashboard page using the common HCopilot theme already decided.

---

# 1. Use the New Global HCopilot Application Shell

The Dashboard must use the new common application shell.

## Top Bar

Use the strong indigo/navy HCopilot navbar rather than the current plain white header.

The top bar must include:

- Final HCopilot application icon — selected Logo Option 5
- HCopilot wordmark
- Main navigation
- Global patient search
- Notifications
- User identity
- User role/department
- Account dropdown

Recommended navigation structure:

- Home
- ER ISBAR Entry
- Live ER
- History
- Statistics
- Settings

The active Home page should use the standard active-navigation treatment.

Do not create Dashboard-specific navigation styling.

---

# 2. HCopilot Branding

Replace the plain text-only HCopilot identity with the selected HCopilot application logo.

Use:

- Option 5 HCopilot icon
- HCopilot wordmark
- Optional small tagline:

Smarter ER Care. Together.

The logo must remain visible and recognizable at navbar size.

---

# 3. Dashboard Page Header

Replace:

HCopilot
Emergency Department overview

with:

HCopilot Overview

Subtitle:

Central workspace for ER operations and hospital insights.

On the right side of the page header, show:

- current date
- current local time
- hospital/site name

Example:

Tue, Sep 22, 2026
5:45 PM
Al-Rassoul Al-Aazam Hospital

The hospital name should come from frontend configuration/environment rather than being hardcoded directly into components.

---

# 4. Add a Compact Branded Welcome Panel

Add a visually strong but compact welcome section underneath the page title.

Approximate height:

180–220 px

The welcome panel should not dominate the Dashboard or push operational information below the fold.

## Left Side

Show:

- time-based greeting
- authenticated user name
- short product/operational message

Example:

GOOD AFTERNOON

Abbass Zahreddine

Here is what is happening in the ER today. HCopilot helps you stay informed, act faster, and keep patient flow visible.

A short HCopilot statement may appear below.

Example:

Safer decisions. A more connected ER.

## Right / Background

Use a locally bundled hospital/clinical visual.

Visual requirements:

- subtle
- professional
- cool-toned
- low contrast
- not visually distracting
- readable text must remain clear
- no runtime internet dependency

Do not turn the Dashboard into a marketing landing page.

The image provides product identity only.

---

# 5. Add the Main Operational KPI Row

Under the welcome panel, add four operational KPI cards.

These should use real backend/application data only.

## KPI 1 — Active ER Patients

Display:

Active ER Patients

Value:

number of patients currently present in the ER.

Primary source:

current ER roster / current-visits API.

Do not show historical comparison percentages unless such historical data actually exists.

---

## KPI 2 — Occupied Beds

Display:

Occupied Beds

Recommended value:

occupied / total usable beds

Example:

18 / 24

Also show occupancy percentage when it can be calculated directly.

Example:

75% occupancy

Source:

existing HCopilot bed data.

---

## KPI 3 — Waiting Without Bed

Display:

Waiting Without Bed

Value:

number of active HCopilot ER patients who currently do not occupy a bed.

This includes patients who:

- do not currently require a bed
- are waiting because no bed is available
- have not yet been placed

Source:

active patient placement + bed assignment state.

---

## KPI 4 — Discharged Today

Display:

Discharged Today

Value:

number of ER stays whose HCopilot departure occurred today.

Source:

existing patient stay/departure data.

Use the current local hospital date.

---

# 6. KPI Styling

All KPI cards should use the same component system.

Shared properties:

- same height
- same radius
- same padding
- same typography hierarchy
- same number positioning

Use semantic icon accents:

Active ER Patients:
blue/indigo patient icon

Occupied Beds:
green or neutral bed icon with occupancy information

Waiting Without Bed:
amber waiting/time icon

Discharged Today:
violet/indigo record/discharge icon

Do not make the entire cards highly saturated.

Prefer:

white card
+
soft semantic icon background
+
dark number
+
small metadata

Do not display fabricated:

+12% vs yesterday
+33%
+20%

unless real historical comparison logic is implemented later.

---

# 7. Quick Actions Section

Keep the useful navigation shortcuts from the current Dashboard, but they must become only one part of the page.

Title:

Quick Actions

Subtitle:

Common tasks, one click away.

Include four actions:

## New ISBAR Entry

Primary action.

Description:

Create a new ER handover

Route:

ER ISBAR Entry

Visually emphasize this action using the HCopilot primary indigo treatment.

---

## Open Live ER

Description:

View current patient placement

Route:

Live ER

---

## View History

Description:

Search previous ER encounters

Route:

History

---

## Review Statistics

Description:

Explore ER trends and analytics

Route:

Statistics

The three secondary actions should not compete visually with the primary New ISBAR Entry action.

---

# 8. Add Recent ER Activity

Create a compact Recent ER Activity panel.

For V1, do NOT create a new event-log architecture simply for this Dashboard.

Instead derive activity from information already available in HCopilot.

Possible events include:

- patient arrived
- HCopilot stay / ISBAR started
- bed assigned
- bed changed
- patient soft-departed
- patient discharged

Only display events that can be reliably derived from current data.

Do not invent:

- imaging events
- laboratory events
- PACS events

unless those integrations genuinely exist.

Suggested table structure:

Time
Patient
Event
Details

Example:

10:18
#10000123
Bed Assigned
Bed 203

Keep only approximately 5–8 recent items on Home.

Provide:

View all

only if a meaningful destination exists.

---

# 9. Add HCopilot Operational Alerts

Create a Dashboard panel named:

Today's Alerts

or:

Operational Alerts

For V1, include only alerts that HCopilot can calculate reliably.

## Alert Type 1 — New ER Patient Waiting for ISBAR

Trigger when:

patient exists in live ER roster
AND
has not yet been started/created in HCopilot
AND
approximately 5 minutes have passed since ER arrival.

Example:

2 new patients waiting > 5 min

ISBAR entry has not yet been started.

Severity:

warning / amber.

---

## Alert Type 2 — High Bed Occupancy

Calculate:

occupied usable beds / total usable beds

Initial configurable assumption:

- below 80% = normal
- 80–90% = warning
- above 90% = high attention

Do not hardcode these thresholds inside random UI components.

Store them centrally in configuration/constants.

Example:

High ER occupancy

92% of beds are currently occupied.

---

## Alert Type 3 — ER Data / API Freshness

Warn when the ER roster API becomes unavailable or stale.

Examples:

ER roster connection unavailable

or:

ER roster has not updated for 8 minutes.

The UI should clearly distinguish:

- normal
- warning
- unavailable

Do not use aggressive flashing.

Use:

- badge
- border
- icon
- subtle background tint

---

# 10. Add System / Integration Status

Add a compact System Status panel.

This is especially important because HCopilot depends on external hospital APIs and runs in an offline hospital environment.

Only show real HCopilot dependencies.

Possible services:

- HCopilot Backend
- Database
- Hospital Directory API
- ER Current Visits API
- Authentication service, if separately meaningful

Do NOT display generic items such as:

- PACS
- LIS
- Imaging
- Laboratory

unless HCopilot actually integrates with those systems.

Recommended states:

Operational
Degraded
Unavailable
Unknown

Use a small semantic status indicator plus text.

Example:

ER Current Visits API    ● Operational

---

# 11. Backend Health Support

Add or use a lightweight backend health mechanism when needed.

Recommended concept:

GET /health

or equivalent.

The endpoint may report:

- backend status
- database status
- Hospital Directory API connectivity
- ER Current Visits API connectivity

Do not expose sensitive infrastructure information.

The Dashboard does not require a full infrastructure-monitoring system.

It only needs enough status information to tell the user whether the services required by HCopilot are operational.

If this endpoint does not exist yet, keep the frontend component architecture ready for it and clearly document the backend requirement.

---

# 12. Global Search

The top navigation must contain the previously agreed global search box.

Suggested placeholder:

Search patients, MRN, or visit ID...

The search should eventually support meaningful identifiers available in HCopilot.

Do not implement a visually functional search field that does absolutely nothing.

If complete global search is not part of this iteration, clearly implement the UI component and connect only the search scopes that are currently supported.

---

# 13. User Identity

Replace the current placeholder:

U

with proper user identity.

Preferred presentation:

Avatar or initials

User Name
Role / Department

Example:

AZ
Abbass Zahreddine
AI Department

or actual authenticated user information.

Never hardcode example users such as Dr. Sarah Chen in production.

Use authenticated session data.

If detailed profile information is unavailable, degrade gracefully to:

initials
username/account name

---

# 14. Dashboard Lower Layout

Recommended desktop structure:

Recent ER Activity | Operational Alerts | System Status

Approximate proportions:

Recent Activity:
35–40%

Alerts:
30–35%

System Status:
25–30%

Exact proportions may be adjusted to produce better visual balance.

All three panels should share:

- similar height
- aligned headers
- consistent padding
- same border/radius system

---

# 15. Dashboard Density

The Home page must use the available desktop viewport productively.

The current implementation leaves the majority of the page empty.

Avoid this.

The new Dashboard should feel populated but not crowded.

Target screen sizes include:

1366 px
1440 px
1600 px
1920 px

At typical desktop resolution, the user should see:

- app shell
- page header
- welcome panel
- KPI row
- quick actions
- most or all of the lower dashboard panels

without excessive scrolling.

---

# 16. Dashboard Color Behaviour

Follow the new global HCopilot semantic color system.

Use:

Indigo:
brand / primary action / selection

Green:
available / operational / successful

Amber:
waiting / warning / attention

Red:
critical / unavailable / dangerous

Muted coral/red:
occupied

Slate:
neutral / secondary information

Do not make the Dashboard colorful merely for decoration.

Every strong color should communicate either:

- brand
or
- state

---

# 17. Dashboard Icons

Use the agreed professional SVG icon system.

Recommended:

Lucide React

Do not use emoji.

Examples:

Users
Bed
Clock
FileText
Activity
AlertTriangle
Server
RefreshCw
Search

All icons should use consistent stroke and sizing.

---

# 18. Dashboard Component Structure

Prefer reusable components such as:

DashboardPage

WelcomePanel

MetricCard

QuickAction

RecentActivityPanel

OperationalAlertsPanel

SystemStatusPanel

StatusIndicator

PageHeader

Do not duplicate card CSS independently for each section.

---

# 19. Loading Behaviour

The Dashboard aggregates multiple data sources.

Do not block the entire page because one API is slow.

Each panel should manage its own:

- loading
- success
- empty
- failure

state.

Example:

If bed API fails:

Occupied Beds
Unavailable

while:

Active ER Patients
32

may still display correctly.

Use restrained skeleton loading where appropriate.

---

# 20. Error Behaviour

Avoid displaying technical exception text directly to hospital users.

Example:

Bad:

Failed to fetch TypeError: Network request failed

Good:

ER roster unavailable

The latest ER patient information could not be retrieved.

Retry

Technical details may remain in logs/developer tools.

---

# 21. Refresh Behaviour

The Dashboard may auto-refresh operational information.

Use a sensible interval based on existing API design.

Do not refresh the entire React page.

Refresh relevant queries through the data-fetching layer.

Provide:

Last updated HH:MM

where useful.

Manual refresh may be available for:

- system status
- operational data

Avoid numerous independent Refresh buttons across the Dashboard.

---

# 22. Hero Image Asset

The clinical image must be packaged locally with the frontend.

Requirements:

- no CDN
- no external URL
- no runtime internet dependency
- optimized size
- appropriate resolution
- professional hospital/ER context
- subdued treatment

The frontend must remain fully functional in the air-gapped environment.

---

# 23. Responsive Behaviour

Primary target remains desktop hospital workstations.

On smaller widths:

- KPI cards may wrap from four to two-per-row
- lower dashboard panels may stack
- Quick Actions may wrap
- hero remains readable
- top navigation may reduce spacing

Do not hide critical operational information simply to preserve aesthetics.

---

# 24. Do Not Copy the Concept Mockup Blindly

The previous generated Dashboard image is a visual direction, not a literal data specification.

Do not implement unsupported example data merely because it appears in the mockup.

Specifically avoid fabricating:

- percentage trends
- lab delays
- imaging delays
- PACS connectivity
- LIS connectivity
- fake staff names
- fake hospital names
- fake operational events

Use real HCopilot data wherever possible.

If data is unavailable:

- omit the optional item
- display an appropriate empty/unavailable state
- or document the backend capability required

---

# 25. Final Dashboard Information Architecture

The resulting page should follow this hierarchy:

Application Shell

↓

HCopilot Overview
Date / Time / Hospital

↓

Compact Welcome / Brand Panel

↓

Operational KPI Row

Active ER Patients
Occupied Beds
Waiting Without Bed
Discharged Today

↓

Quick Actions

New ISBAR Entry
Open Live ER
View History
Review Statistics

↓

Operational Information

Recent ER Activity
Operational Alerts
System Status

---

# 26. Core UX Principle

The existing Home page asks:

Where do you want to go?

The new Home page must instead answer:

What is happening in the ER right now?

and then:

What do you want to do about it?

Navigation remains available, but situational awareness becomes the primary purpose of the page.

---

# 27. Locked Dashboard Decisions

The following decisions are considered approved:

- Home becomes an operational dashboard rather than a route launcher.
- Use the new branded indigo HCopilot application shell.
- Use the selected HCopilot Option 5 logo.
- Add global search, notifications, and proper user identity.
- Use a compact 180–220 px branded welcome panel.
- Add four real operational KPIs.
- Do not fabricate KPI trend percentages.
- Keep Quick Actions as a secondary Dashboard section.
- Derive Recent Activity from existing HCopilot timestamps/events for V1.
- Do not create a full event-log architecture for V1.
- Add actionable HCopilot alerts only.
- Use approximately 5 minutes as the new-patient-without-ISBAR attention threshold.
- Add configurable occupancy warnings.
- Add ER/API freshness alerts.
- Add a compact System Status panel.
- Prefer a lightweight backend health endpoint for proper service status.
- Do not invent PACS/LIS/lab/imaging integrations.
- Keep all production assets local for air-gapped deployment.
- Use professional SVG icons and no emoji.
- Preserve the neutral workspace + semantic status color system.

---

# Definition of Done — Dashboard

The Dashboard redesign is considered complete when:

- it no longer resembles the existing four-card launcher page
- the new HCopilot navbar/theme is applied
- the Option 5 logo is integrated
- authenticated user identity is visible
- global search location exists
- notifications UI exists
- the welcome panel is implemented
- four operational KPIs use real data
- Quick Actions navigate correctly
- Recent Activity displays only supported events
- operational alerts use real rules
- system/integration status is available where supported
- unsupported sample/mock data is not fabricated
- loading/error/empty states are implemented
- the page works without internet access
- layout works on standard hospital desktop resolutions
- the page feels like a real ER operational overview rather than a frontend scaffold
```


