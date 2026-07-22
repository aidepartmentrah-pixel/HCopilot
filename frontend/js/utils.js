/**
 * utils.js — Shared constants, helpers, and global configuration used across
 * all feature modules in HCopilot.
 *
 * This file must be loaded before any feature module because every module
 * relies on the constants and helper functions defined here.
 *
 * Key globals exported to the global scope:
 *   API_BASE          — base URL for the patient-flow API namespace
 *   STAFF_BASE        — base URL for the staff API namespace
 *   BEDS_BASE         — base URL for the beds API namespace
 *   DATASETS          — registry of read-only (server-paginated) dataset definitions
 *   MANAGED_DATASETS  — registry of fully editable (client-paginated) dataset definitions
 *   nowLocalIso()     — returns the current local time as "YYYY-MM-DDTHH:MM"
 *   onDataChange()    — subscribe a callback to the data-change notification bus
 *   notifyDataChange()— publish a data-change event to all subscribers
 *   parseApiError()   — convert a FastAPI validation error to a readable string
 *   showMessage()     — display a temporary toast notification
 *   formatHeader()    — convert snake_case column keys to Title Case
 *   formatValue()     — truncate long cell values so tables stay readable
 */

// Shared constants, helpers, and global config used across all feature modules.

// ── API base URLs ─────────────────────────────────────────────────────────────

// Base URLs for the three most-used API namespaces.
// All three point to the same local FastAPI server but different router prefixes.
// Keeping them as named constants makes it easy to update the host/port in one place.
const API_BASE   = '/api/patient-flow';
const STAFF_BASE = '/api/staff';
const BEDS_BASE  = '/api/beds';

// ── Dataset registry ──────────────────────────────────────────────────────────

// Read-only datasets fetched from the remote API server (or locally for localOnly ones).
// Each entry is rendered as a card by createDatasetCard() in dataset_display.js.
// The `localOnly` flag suppresses the "Update from API" button for datasets that
// only exist locally and have no remote source to pull from.
const DATASETS = [
    { id: 'diagnosis',            name: 'Diagnosis Records',        icon: '🩺' },
    { id: 'Patients',             name: 'Patients Records',          icon: '🚑' },
    { id: 'vitalsign_with_synth', name: 'Vital Signs',               icon: '💓' },
    { id: 'meteo',                name: 'Weather Data',              icon: '🌤️' },
    { id: 'edstays_with_synth',   name: 'Emergency Stays',           icon: '🏥' },
    { id: 'medrecon_with_synth',  name: 'Medication Reconciliation', icon: '💊' },
    { id: 'pyxis_with_synth',     name: 'Medication Dispensing',     icon: '💉' },
    { id: 'Wards',                name: 'Wards',                     icon: '🏢', localOnly: true },
    { id: 'DailyPatients',        name: 'Daily Patients',            icon: '📅', localOnly: true }
];

/**
 * Escape a value for safe embedding inside a single-quoted HTML attribute.
 * Used when serialising row objects into data-* attributes on action buttons
 * so that the JSON string can be safely passed through an onclick handler.
 *
 * Two replacements are needed in order:
 *   1. Backslashes first — if single-quotes were replaced first, their new
 *      backslash prefix would be double-escaped in the second pass.
 *   2. Single quotes — replaced with backslash-quote so the attribute delimiter
 *      (a surrounding single quote in the HTML) is not broken.
 *
 * `v == null` uses loose equality to catch both null and undefined with one check.
 *
 * @param {*} v - Any value; null/undefined become empty string.
 * @returns {string} HTML-attribute-safe string with backslashes and single-quotes escaped.
 */
function _safeAttr(v) { return String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

// ── Managed (editable) dataset registry ──────────────────────────────────────

// MANAGED_DATASETS wire each entity to its API endpoint and column definitions.
// The openAdd/openEdit/openDelete callbacks let dataset_display.js open the right
// modal without knowing which entity it is rendering.
// Adding a new managed dataset only requires adding an entry here — no HTML changes needed.
const MANAGED_DATASETS = [
    {
        id: 'Doctors',
        name: 'Doctors',
        icon: '👨‍⚕️',
        fetchUrl: STAFF_BASE + '/doctors/list',
        dataKey: 'doctors',
        columns: [
            { key: 'id',                    label: 'ID'                },
            { key: 'ward',                  label: 'Ward'              },
            { key: 'intern_or_not',         label: 'Type'              },
            { key: 'shift',                 label: 'Shift'             },
            { key: 'work_days',             label: 'Group'             },
            { key: 'patientNb',             label: 'Patient Nb'        },
            { key: 'availabilityTimeStart', label: 'Availability Start'}
        ],
        openAdd:    () => openAddDoctorModal(),
        openEdit:   (r) => openEditDoctorModal(r.id, r.ward, r.intern_or_not, r.shift, r.work_days),
        openDelete: (r) => confirmDeleteDoctor(r.id, r.ward, r.intern_or_not)
    },
    {
        id: 'Nurses',
        name: 'Nurses',
        icon: '👩‍⚕️',
        fetchUrl: STAFF_BASE + '/nurses/list',
        dataKey: 'nurses',
        columns: [
            { key: 'id',                    label: 'ID'                },
            { key: 'ward',                  label: 'Ward'              },
            { key: 'role',                  label: 'Role'              },
            { key: 'shift',                 label: 'Shift'             },
            { key: 'group',                 label: 'Group'             },
            { key: 'patientNB',             label: 'Patient NB'        },
            { key: 'availabilityTimeStart', label: 'Availability Start'}
        ],
        openAdd:    () => openAddNurseModal(),
        openEdit:   (r) => openEditNurseModal(r.id, r.ward, r.role, r.shift, r.group),
        openDelete: (r) => confirmDeleteNurse(r.id, r.ward, r.role)
    },
    {
        id: 'EDbeds',
        name: 'ED Beds',
        icon: '🛏️',
        fetchUrl: BEDS_BASE + '/list',
        dataKey: 'beds',
        columns: [
            { key: 'bed_id',     label: 'ID'         },
            { key: 'bed_number', label: 'Bed Number'  },
            { key: 'bed_status', label: 'Status'      },
            { key: 'bed_type',   label: 'Type'        },
            { key: 'ward_id',    label: 'Ward'        },
            { key: 'patientID',  label: 'Patient ID'  }
        ],
        openAdd:    () => openAddBedModal(),
        openEdit:   (r) => openEditBedModal(r.bed_id, r.bed_number, r.bed_status, r.ward_id, r.bed_type),
        openDelete: (r) => confirmDeleteBed(r.bed_id, r.bed_number)
    }
];

// ── Local time helper ─────────────────────────────────────────────────────────

/**
 * Returns the current local time formatted as "YYYY-MM-DDTHH:MM".
 *
 * Use this instead of new Date().toISOString() for datetime-local inputs so
 * pre-filled values match the backend's datetime.now() (also local time).
 * toISOString() always returns UTC, which would show the wrong time in the
 * form for any user not in the UTC timezone.
 *
 * padStart(2, '0') ensures two-digit month/day/hour/minute values by
 * left-padding with a zero when needed (e.g. month 3 → "03").
 *
 * @returns {string} Local time string compatible with <input type="datetime-local">.
 */
function nowLocalIso() {
    const d = new Date();
    // Arrow function reused across all six date components for brevity
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Data-change notification bus ─────────────────────────────────────────────
// Any section that writes data calls notifyDataChange(type, message).
// The simulation section listens so it can auto-refresh when data changes.
// Other sections (beds, patients) also subscribe to keep their views in sync
// when changes originate from a different part of the UI.

/** @type {Function[]} Array of registered listener callbacks. */
const _dataChangeListeners = [];

/**
 * Register a callback to be invoked whenever any data-write operation completes.
 * Used by Simulation, Patients, and other sections to auto-refresh on external changes.
 *
 * Callbacks are stored in a simple array; there is no deduplication, so calling
 * onDataChange with the same function twice will register it twice.
 *
 * @param {function({type: string, message: string}): void} fn - Callback receiving event details.
 */
function onDataChange(fn) {
    _dataChangeListeners.push(fn);
}

/**
 * Broadcast a data-change event to all registered listeners.
 * Each listener is called with { type, message }; errors are swallowed so one
 * bad listener cannot break the others or prevent subsequent listeners from running.
 *
 * The underscore parameter name `_` in the catch clause signals intentionally
 * ignored error — the goal is to be resilient, not to log every listener failure.
 *
 * @param {string} type    - Category of the change (e.g. 'beds', 'patient', 'staff').
 * @param {string} message - Human-readable description of what changed.
 */
function notifyDataChange(type, message) {
    _dataChangeListeners.forEach(fn => { try { fn({ type, message }); } catch (_) {} });
}

// ── Shared utility functions ──────────────────────────────────────────────────

/**
 * Convert a FastAPI validation error payload to a readable single-line message.
 * FastAPI returns `detail` as either a plain string or an array of field-error objects.
 *
 * When `detail` is an array each item has:
 *   - e.loc: array of location segments, e.g. ["body", "patient_id"] or ["body", "vitals", "temperature"]
 *   - e.msg: the validation message, e.g. "Value error, must be positive"
 *   - e.type: machine-readable error type (not used here)
 *
 * The first segment of e.loc is always "body" (or "query"/"path"), which is
 * not user-meaningful, so it is stripped by slice(1).
 *
 * The "Value error, " prefix that Pydantic prepends to custom validator messages
 * is stripped with a case-insensitive regex for cleaner display.
 *
 * @param {string|Array|undefined} detail - The `detail` field from the API error response.
 * @returns {string} Human-readable error string.
 */
function parseApiError(detail) {
    if (!detail) return 'An error occurred';
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
        return detail.map(function(e) {
            // e.loc is an array like ["body", "field_name"] — skip the first "body" segment
            var field = e.loc && e.loc.length > 1 ? e.loc.slice(1).join(' → ') : '';
            var msg   = (e.msg || 'Invalid value').replace(/^Value error,\s*/i, '');
            return field ? field + ': ' + msg : msg;
        }).join('; ');
    }
    return String(detail);
}

/**
 * Display a temporary toast notification at the top of the page.
 * The message disappears automatically after 5 seconds.
 *
 * The #message element must exist in index.html.
 * CSS classes 'success', 'error', and 'info' control the background colour.
 *
 * @param {string} message - Text to display in the toast.
 * @param {string} type    - CSS modifier class: 'success', 'error', or 'info'.
 */
function showMessage(message, type) {
    const messageDiv = document.getElementById('message');
    messageDiv.textContent  = message;
    // className replaces any previous type so old colours don't linger
    messageDiv.className    = `message ${type}`;
    messageDiv.style.display = 'block';
    // Auto-hide after 5 seconds so the user doesn't have to dismiss it manually
    setTimeout(() => { messageDiv.style.display = 'none'; }, 5000);
}

/**
 * Convert a snake_case column key to Title Case for use as a table heading.
 * Example: "ward_id" → "Ward Id"
 *
 * Two chained regex replacements:
 *   1. Replace every underscore with a space.
 *   2. Capitalise the first character of each space-separated word (\b\w matches
 *      the first letter after a word boundary).
 *
 * @param {string} header - Raw column key from the API response.
 * @returns {string} Human-readable heading string.
 */
function formatHeader(header) {
    return header.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Truncate long cell values so table columns do not overflow.
 * Strings longer than 50 characters are shortened with an ellipsis.
 * Null/undefined values are shown as a dash so empty cells are visually distinct
 * from cells that genuinely contain the string "null".
 *
 * @param {*} value - Raw cell value from the API response.
 * @returns {string|*} Truncated string or the original value if short enough.
 */
function formatValue(value) {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'string' && value.length > 50) {
        return value.substring(0, 50) + '...';
    }
    return value;
}

// ── Destination select + detail-text helpers ───────────────────────────────
// Every departure/discharge popup (beds, scheduling, unurgent, log-patient
// edit) pairs a "Home" / "Hospital Department" <select> with a free-text
// <input> for naming the department. These three helpers keep that select+
// text pairing and its "Hospital Department: <name>" storage format
// consistent across all of them.

const _DEST_DETAIL_PREFIX = 'Hospital Department:';

/**
 * Show/hide the detail text input next to a destination <select>, based on
 * whether "Hospital Department" is currently selected. Clears the detail
 * input whenever it is hidden so a stale value can't be saved silently.
 */
function toggleDestinationDetail(selectId, detailId) {
    const select = document.getElementById(selectId);
    const detail = document.getElementById(detailId);
    if (!select || !detail) return;
    const showDetail = select.value === 'Hospital Department';
    detail.style.display = showDetail ? '' : 'none';
    if (!showDetail) detail.value = '';
}

/**
 * Combine a destination <select> + detail <input> pair into the single
 * string stored in the `destination` column, e.g. "Hospital Department: Cardiology".
 * Falls back to the bare select value when no detail was entered.
 * Returns null when nothing is selected.
 */
function composeDestination(selectId, detailId) {
    const select = document.getElementById(selectId);
    const detail = document.getElementById(detailId);
    if (!select || !select.value) return null;
    const base = select.value;
    const detailText = detail ? detail.value.trim() : '';
    if (base === 'Hospital Department' && detailText) {
        return (base + ': ' + detailText).slice(0, 50);
    }
    return base;
}

/**
 * Reverse of composeDestination(): split a stored destination string back
 * into the <select> value and the detail <input> text, and sync the detail
 * input's visibility to match.
 */
function splitDestination(selectId, detailId, value) {
    const select = document.getElementById(selectId);
    const detail = document.getElementById(detailId);
    if (!select) return;
    if (value && value.indexOf(_DEST_DETAIL_PREFIX) === 0) {
        select.value = 'Hospital Department';
        if (detail) detail.value = value.slice(_DEST_DETAIL_PREFIX.length).trim();
    } else {
        select.value = value || '';
        if (detail) detail.value = '';
    }
    toggleDestinationDetail(selectId, detailId);
}
