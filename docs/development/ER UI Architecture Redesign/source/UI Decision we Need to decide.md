# HCopilot — ER UI Architecture Decisions

## Purpose

The HCopilot ER workflow changed significantly after the introduction of the live ER API integration.

The previous UI mixed several different responsibilities inside the same screens:

- Selecting or creating a patient stay
- Entering ISBAR information
- Viewing currently active patients
- Managing beds
- Managing patients who do not have beds
- Recording departures
- Browsing historical patient stays

The new UI should separate these responsibilities clearly while still making the overall system feel like one coherent application.

Three major UI architecture decisions were therefore made:

1. **New Patient / ISBAR interaction**
2. **Live ER / Bed Management interaction**
3. **Historical Patient Records interaction**

These decisions define the high-level structure of the UI before smaller visual decisions such as exact colors, spacing, icons, terminology, and animations are implemented.

---

# Decision 1 — New Patient / ISBAR Page

## Problem

The nurse needs to:

1. See patients who have recently entered the ER.
2. Select the patient being handled.
3. Complete the six ISBAR sections for that patient.

The old design attempted to display the live ER roster, patient search, patient data, and the ISBAR form together in a compact area.

This created competition for screen space and made the responsibility of the page unclear.

Several interaction models were considered:

1. Disabled ISBAR form until patient selection
2. Patient-selection modal
3. Split master-detail layout
4. Two-stage page: Choose Patient → Complete ISBAR

## Decision

### Use a visible ISBAR form that remains disabled until a patient is selected.

The page should contain two main areas:

- **Live ER Roster**
- **ISBAR Form**

When no patient is selected, the ISBAR form remains visible but inactive.

Example state:

> No patient selected
> Select a patient from the Live ER Roster to begin ISBAR entry.

The disabled form allows the user to immediately understand what will happen after patient selection without allowing data to be entered without a patient context.

Once the nurse selects a patient from the Live ER Roster:

1. The HCopilot encounter/stay is started.
2. Available patient information is loaded automatically.
3. The selected patient identity becomes clearly visible.
4. The ISBAR sections become active.
5. The nurse can begin data entry immediately.

The interaction should therefore be:

`Live ER Roster → Select Patient → ISBAR Form Activates`

There should not normally be an additional confirmation modal.

## Rationale

The live incoming-patient list is expected to remain small during normal operation.

The nurse therefore does not need a complex selection workflow.

The most frequent workflow should require as few actions as possible:

`See patient → Click patient → Start working`

A modal would create another interaction layer:

`See patient → Select patient → Confirm patient → Start working`

The disabled-form approach is faster while still making it obvious whether the nurse currently has a patient selected.

## Patient Identity Safety

Once a patient is selected, the active patient identity must be extremely obvious.

For example:

> **Abbass Zahreddine**
> 24 years · Male
> Arrived 18:42
> Patient #123456

A **Change Patient** action should also be available.

The interface must make it difficult for the nurse to unknowingly enter information under the wrong patient.

## ISBAR Structure

The six sections remain:

1. Patient & Arrival
2. Initial Vital Signs
3. Situation
4. Background
5. Focused Assessment
6. Recommendation & Handover

These sections may remain accordion-style as in the current system.

## Search and Manual Entry

The **Live ER Roster becomes the primary patient-entry mechanism**.

Hospital Directory Search and Manual Entry remain available only as fallback mechanisms.

They should therefore not visually compete with the Live ER Roster.

A suitable pattern is:

> Can't find the patient?
> Search Hospital Directory · Manual Entry

## Final Page Responsibility

### Page A — New Patient / ISBAR

This page answers one question:

> **Which newly arrived patient am I documenting, and what is their ISBAR information?**

It should not become the primary place for:

- Bed management
- ER-wide patient management
- Historical patient browsing

---

# Decision 2 — Live ER / Bed Management Page

## Problem

The existing Bed Care page visually treats two active ER states as completely different types of objects:

- Patients occupying beds
- Patients currently in the ER without beds

Beds are represented as compact graphical cards, while patients without beds are represented as large patient cards in a separate section.

This creates an artificial conceptual separation.

Operationally, however, both represent the same thing:

> **An active ER patient and their current placement state.**

A patient may move from:

`No Bed → Assigned Bed`

without becoming a fundamentally different type of entity.

The UI should communicate this relationship visually.

## Decision

### Use a unified horizontal placement board with one shared card/component system.

Bed-assigned patients and patients without beds should use the **same visual component family**.

The cards should have:

- The same dimensions
- The same proportions
- The same typography hierarchy
- The same border radius
- The same internal spacing
- The same location for status indicators
- The same interaction pattern

The patient's **placement state** is communicated primarily through the icon and status treatment.

---

## Bed State

A patient assigned to a bed uses a **bed icon**.

Example:

> 🛏
> **301**
> OCCUPIED
> Patient #10000123
> Abbass Zahreddine

An empty bed uses the same bed card component:

> 🛏
> **302**
> AVAILABLE

---

## No-Bed State

A patient currently inside the ER but without a bed uses a **seated-person / chair icon**.

Example:

> 🪑 / seated patient icon
> **Patient #10000127**
> WAITING / NO BED
> Acuity 3
> Abbass Zahreddine

The reason for having no bed may include:

- The patient does not clinically require a bed.
- No appropriate bed is currently available.
- The patient is waiting for placement.

These patients remain active ER patients.

---

# Horizontal Placement Model

The Live ER board should be structured as horizontal lanes.

Example:

## Emergency / Main ER

`[ Bed 301 ] [ Bed 302 ] [ Bed 303 ] [ Waiting Patient ]`

## Observation

`[ Bed 401 ] [ Bed 402 ] [ Bed 403 ] [ Waiting Patient ]`

## Trauma / High Acuity

`[ Bed T01 ] [ Bed T02 ] [ Waiting Patient ]`

A separate **Waiting / No Bed** lane may also exist for patients who are not associated with a particular ER area.

Example:

## Waiting / No Bed

`[ Patient ] [ Patient ] [ Patient ] [ Patient ]`

All objects remain visually related because they use the same component system.

---

# Why the Unified Component System Matters

The UI should communicate:

> These are all active ER patients or ER placement resources.

rather than:

> Beds belong to one system while no-bed patients belong to another unrelated system.

This creates a clearer mental model.

A patient changing from no-bed to bed-assigned should feel like a **state transition**, not like moving between unrelated application modules.

Conceptually:

`Waiting Patient Card → Assign Bed → Bed Occupied Card`

---

# State Differentiation

The cards should remain visually related but not identical.

## Shared Characteristics

- Same width
- Same height
- Same information hierarchy
- Same spacing
- Same interaction locations
- Same typography
- Same component structure

## State-Specific Characteristics

### Available Bed
- Bed icon
- Green state
- AVAILABLE

### Occupied Bed
- Bed icon
- Occupied state
- Patient identity shown

### Patient Without Bed
- Seated-person / chair icon
- Waiting/unassigned state
- Patient identity shown
- Acuity shown

The icon should allow the user to recognize the placement state immediately.

---

# Suggested Live ER Summary

The top of the page may contain compact operational indicators such as:

- Total Beds
- Occupied Beds
- Available Beds
- Patients Without Bed
- Patients Waiting > 5 Minutes

These provide ER-wide context without replacing the operational board.

---

# Waiting-Time Attention

Patients who have remained in an unresolved state longer than the expected workflow threshold should receive visual attention.

The working idea is approximately:

> **5 minutes without being handled → visual attention state**

The exact visual treatment can be decided later.

Possible treatments include:

- Border emphasis
- Small warning badge
- Subtle pulse/highlight
- Time indicator

The UI should avoid aggressive flashing unless operational testing shows that it is necessary.

---

# Departure Behaviour

HCopilot supports a **soft departure**.

When the nurse marks the patient as departed:

- The patient should disappear from the active ER board immediately.

The external ER API later provides reconciliation and cleanup.

Therefore:

- HCopilot departure represents the operational reality of the ER space.
- External API departure provides confirmation and protects against forgotten/manual departure actions.

---

# Final Page Responsibility

### Page B — Live ER Board

This page answers:

> **Where are the active ER patients right now?**

and:

> **Which beds are available, which are occupied, and which patients currently have no bed?**

The page owns:

- Bed status
- Current patient placement
- Patients without beds
- Bed assignment/reassignment
- Soft departure
- Operational waiting alerts

It does not own historical record browsing or primary ISBAR data entry.

---

# Decision 3 — Patient History Architecture

## Problem

Historical patient records serve a very different purpose from the live ER workflow.

This page is primarily a **retrieval and review interface**.

The user may need to:

1. Search hundreds or thousands of previous stays.
2. Filter the results.
3. Inspect one stay.
4. Quickly move to another stay.
5. Occasionally open a complete record for deeper review or editing.

The existing Patients page mixes historical data with actions such as Addition and other active workflow concepts.

These responsibilities should be separated.

## Foundation

Historical stays should be presented as a **searchable and filterable table**.

A table is appropriate because history may contain a large number of records and users need to compare fields across multiple stays.

Possible columns include:

- Patient
- Patient ID
- Stay ID
- Arrival
- Departure
- Bed
- Acuity
- Vital-sign summary
- Flags
- Status
- Actions

Possible filters include:

- Search by patient name
- Patient ID
- Stay ID
- Date range
- Bed
- Acuity
- Status

---

# Considered Detail-Viewing Options

Four architectures were evaluated:

1. Table → dedicated full record page
2. Table → right-side detail drawer
3. Expandable table row
4. Persistent split view

The strongest options were 1 and 2.

---

# Decision

### Use a resizable right-side preview pane as the default history interaction, with the ability to open the record as a full page.

The normal workflow becomes:

`Search History → Select Record → Preview on Right`

The historical list remains visible while the selected patient's record appears in a right-side detail panel.

Clicking another table row immediately changes the preview.

This allows fast browsing:

`Patient A → Patient B → Patient C`

without repeatedly navigating backward to the History page.

---

# Resizable Preview Pane

The divider between:

- History table
- Record preview

should be draggable horizontally.

The user should be able to make the preview:

- Narrow for quick inspection
- Medium for normal use
- Wide when reviewing longer ISBAR content

A reasonable default is approximately:

`History Table 60–65% | Record Preview 35–40%`

Minimum widths should prevent either side from becoming unusable.

The divider should clearly communicate that it is draggable.

---

# Preview Pane Contents

The preview should contain enough information to review the stay without opening another page.

Suggested structure:

## Patient Summary
- Patient name
- Patient ID
- Stay ID
- Arrival
- Departure
- Bed
- Acuity
- Status

## Clinical Sections
- Patient & Arrival Information
- Initial Vital Signs
- Situation
- Background
- Focused Assessment
- Recommendation & Handover

These may use compact cards or collapsed sections to fit the narrower panel.

---

# Full Record Escape Hatch

The preview pane should contain:

> **Open Full Record**

Selecting this action opens the complete historical stay using a dedicated full-width page.

The full record page provides maximum space for:

- Long clinical text
- Complete ISBAR review
- Printing
- Export
- Editing

This combines the advantages of both architecture options.

Normal browsing uses the preview pane.

Deep inspection uses the full record page.

---

# Editing

Historical records remain editable.

However, complex editing should preferably happen in the full record view rather than inside a narrow preview pane.

The preview pane should primarily be optimized for **inspection and navigation**.

---

# Closing the Preview

The preview panel should have a clear close action.

When closed:

- The History table returns to full width.
- Search/filter context remains unchanged.
- Scroll position and selected filters should remain unchanged.

---

# Final Page Responsibility

### Page C — History

This page answers:

> **What happened during previous ER stays?**

The page owns:

- Historical search
- Filtering
- Historical stay browsing
- Historical ISBAR review
- Opening the complete historical record
- Historical editing where permitted

It does not contain new-patient creation or live bed-management workflows.

---

# Consolidated HCopilot ER Architecture

The resulting system is intentionally divided into three responsibilities.

## Page A — New Patient / ISBAR

**Purpose:** document a newly arrived ER patient.

Flow:

`Live ER Roster → Select Patient → ISBAR Form Activates`

---

## Page B — Live ER Board

**Purpose:** manage the current physical/operational state of the ER.

Uses a unified horizontal card system:

`Bed Patient ↔ Waiting / No-Bed Patient`

with consistent card dimensions and different placement icons.

---

## Page C — History

**Purpose:** retrieve and review previous ER stays.

Flow:

`Search / Filter → Select Historical Stay → Resizable Preview → Optional Full Record`

---

# Overall Design Principle

The three pages should answer three different questions:

### Page A
> **Who am I documenting now?**

### Page B
> **Where are my patients now?**

### Page C
> **What happened previously?**

The UI should preserve this distinction throughout future development.

New controls or features should be placed according to these responsibilities rather than returning to a single page that mixes patient creation, live operations, and historical retrieval.
