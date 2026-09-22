// Patients section — active patient list (DailyPatients) and discharge archive (LogPatients).
//
// Two views toggled by a tab bar:
//   Daily (active)  — live patients currently in the ED; rows from DailyPatients.csv
//   Log (archive)   — discharged patients; rows from LogPatients.csv
//
// Operations available on each row:
//   Daily  → Edit patient record (vitals, demographics, timestamps), Delete stay
//   Log    → Edit archived record, Delete archived record
//
// The add-patient inline form at the bottom of the Daily view creates a new stay
// in DailyPatients.csv.  Next available patient_id and stay_id are fetched from
// /api/patients/next-ids so IDs never collide with the historical Patients.csv data.
//
// Bed assignment for active patients is handled exclusively via the Scheduling
// section and the Beds Display section (the Change Bed button is intentionally
// absent here to keep the patient view read-focused).
//
// Data is refreshed automatically on every onDataChange() event (fired after any
// write operation elsewhere in the app).

let allPatientsData  = [];
let allPatLogData    = [];
let patientBedMap    = {}; // patient_id -> bed object (from /api/beds/list), only for currently-assigned patients
let patEditStayId    = null;
let patEditSource    = 'daily'; // 'daily' | 'log' — controls which API endpoint saveEditPatient calls
// ER Live-Roster Redesign — true when the stay being edited was created from
// a roster pick (record_source="external" + er_visit_id) and still has null
// gender/age/acuity/chiefcomplaint; relaxes saveEditPatient()'s client-side
// required checks to match the server's own check_required_by_origin.
let patEditIsRosterOrigin = false;
let patEditErVisitId = null; // real er_visit_id, resent on save — see saveEditPatient()
let patDeleteStayId  = null;
let patDeleteSource  = 'daily'; // 'daily' | 'log' — controls which API endpoint deletePatient calls
let patActiveView    = 'daily'; // 'daily' | 'log'

// ── ER UI Architecture Redesign, Page A — active-stay state ─────────────────
// The stay currently loaded into the Page A ISBAR panel (#pat-a-isbar-panel),
// or null when no patient is selected. Mirrors patEditStayId/patEditIsRosterOrigin
// above, but for the inline "add" form instead of the edit modal — see
// selectPatStay()/setPatFormMode() below, which replace the old
// roster-pick-into-Edit-modal pattern (ER9) with in-place activation.
let patActiveStayId         = null;
let patActiveIsRosterOrigin = false;
let patActiveErVisitId      = null; // the real er_visit_id, resent on every save so the
                                     // server's check_required_by_origin validator keeps
                                     // recognizing this as roster-origin (see saveActivePatientForm)
// Departure Time / Bed Occupation Time have no input on Page A (2026-09-22
// feedback — neither is ever typed here; see the HTML comment above the old
// field location). bed_occupation_time is still a real column a proper bed
// assignment (assignPatientToBed() in beds_display.js) may already have
// set — mgr.modify() always overwrites every field it's given, so this
// must be cached from the loaded record and resent unchanged on every
// save, or saving ISBAR notes here would silently wipe out a real bed
// assignment. departure_time is always null for an active (non-discharged)
// stay by definition, so it needs no such caching.
let patActiveBedOccupationTime = null;

// Pagination — client-side only (the full filtered set is already in memory
// from allPatientsData/allPatLogData; only the rendered page slice changes).
// Shared across both views since only one table is visible at a time.
let patCurrentPage   = 1;
let patPageSize      = 50;
let patFilteredData  = []; // the full filtered-but-unpaginated array currently on screen, set by renderPatientsTable()/renderLogPatientsTable()

// Hospital Directory search state (Add-Patient form only — see selectPatDirectoryResult()).
let patDirectorySearchTimer = null;
let patDirectoryLinked      = null; // { external_patient_id, full_name } | null — no visit concept in this API
let patDirectorySearchMode  = 'name'; // 'name' | 'id' — which tab is active

window.addEventListener('click', function(e) {
    if (e.target === document.getElementById('patient-edit-modal'))   closeEditPatientModal();
    if (e.target === document.getElementById('patient-delete-modal')) closeDeletePatientModal();
    if (!e.target.closest('.pat-directory-search-field')) {
        const results = document.getElementById('pat-directory-results');
        if (results) results.hidden = true;
    }
});

// ── Hospital Directory search (Add-Patient form) ────────────────────────────
// Optional: search the external Hospital Directory API and, on selection,
// autofill Name/Gender/Age and attach external_patient_id (record_source=
// "external") to the create payload. The vendor API (confirmed via live
// testing against the deployed mock — see its own /openapi.json) accepts
// exactly one search mode per call: an exact Patient ID, or First + Father +
// Last name together — there is no free-text search and no visit concept,
// so the search box mirrors that exactly rather than offering a single
// query box. A manual edit to #pat-name after a selection clears the link
// (see the 'input' listener wired in DOMContentLoaded below) — the linked
// identity no longer matches what's displayed. Submitting without ever
// searching keeps working exactly as before (record_source defaults to
// "local" server-side).

function switchPatDirectoryTab(mode) {
    patDirectorySearchMode = mode;
    document.getElementById('pat-directory-tab-name').classList.toggle('active', mode === 'name');
    document.getElementById('pat-directory-tab-id').classList.toggle('active', mode === 'id');
    document.getElementById('pat-directory-panel-name').hidden = mode !== 'name';
    document.getElementById('pat-directory-panel-id').hidden   = mode !== 'id';

    // Clear whichever panel just became inactive so a stale value there
    // can't silently combine with a new search in the other panel.
    if (mode === 'name') {
        document.getElementById('pat-directory-patient-id').value = '';
    } else {
        ['pat-directory-first-name', 'pat-directory-father-name', 'pat-directory-last-name']
            .forEach(id => { document.getElementById(id).value = ''; });
        document.getElementById('pat-directory-guess-row').hidden = true;
    }
    document.getElementById('pat-directory-results').hidden = true;
}

function onPatDirectorySearchInput() {
    clearTimeout(patDirectorySearchTimer);
    const patientId  = document.getElementById('pat-directory-patient-id').value.trim();
    const firstName  = document.getElementById('pat-directory-first-name').value.trim();
    const fatherName = document.getElementById('pat-directory-father-name').value.trim();
    const lastName   = document.getElementById('pat-directory-last-name').value.trim();
    const resultsEl  = document.getElementById('pat-directory-results');

    // "Find possible matches" only makes sense once First + Last are known
    // but the middle/father name isn't — the vendor's structured search
    // otherwise needs all three, so this is the only way to search at all
    // in that case (see guess.py).
    const guessRow = document.getElementById('pat-directory-guess-row');
    guessRow.hidden = !(patDirectorySearchMode === 'name' && firstName && lastName && !fatherName);

    const ready = (patDirectorySearchMode === 'id' && patientId.length >= 1) ||
                  (patDirectorySearchMode === 'name' && firstName && fatherName && lastName);
    if (!ready) {
        resultsEl.hidden = true;
        resultsEl.innerHTML = '';
        return;
    }
    patDirectorySearchTimer = setTimeout(
        () => _patDirectorySearch({ patientId, firstName, fatherName, lastName }), 350);
}

async function findPatDirectoryPossibleMatches() {
    const firstName = document.getElementById('pat-directory-first-name').value.trim();
    const lastName  = document.getElementById('pat-directory-last-name').value.trim();
    if (!firstName || !lastName) return;

    const resultsEl = document.getElementById('pat-directory-results');
    const btn = document.getElementById('pat-directory-guess-btn');
    resultsEl.hidden = false;
    resultsEl.innerHTML = '<div class="pat-directory-result-status">Checking common middle names…</div>';
    btn.disabled = true;
    try {
        const params = new URLSearchParams({ first_name: firstName, last_name: lastName });
        const res  = await fetch(`/api/hospital-directory/patients/find-possible-matches?${params.toString()}`);
        const data = await res.json();
        if (!data.success) {
            resultsEl.innerHTML = `<div class="pat-directory-result-status">${_escapeHtml(_patDirectoryStatusMessage(data.status, data.message))}</div>`;
            return;
        }
        _renderPatDirectoryResultItems(data.items);
    } catch (error) {
        resultsEl.innerHTML = `<div class="pat-directory-result-status">Network error: ${_escapeHtml(error.message)}</div>`;
    } finally {
        btn.disabled = false;
    }
}

async function _patDirectorySearch({ patientId, firstName, fatherName, lastName }) {
    const resultsEl = document.getElementById('pat-directory-results');
    resultsEl.hidden = false;
    resultsEl.innerHTML = '<div class="pat-directory-result-status">Searching…</div>';
    try {
        const params = new URLSearchParams({ limit: '20' });
        if (patientId) {
            params.set('patient_id', patientId);
        } else {
            params.set('first_name', firstName);
            params.set('father_name', fatherName);
            params.set('last_name', lastName);
        }
        const res  = await fetch(`/api/hospital-directory/patients/search?${params.toString()}`);
        const data = await res.json();
        if (!data.success) {
            resultsEl.innerHTML = `<div class="pat-directory-result-status">${_escapeHtml(_patDirectoryStatusMessage(data.status, data.message))}</div>`;
            return;
        }
        _renderPatDirectoryResultItems(data.items);
    } catch (error) {
        resultsEl.innerHTML = `<div class="pat-directory-result-status">Network error: ${_escapeHtml(error.message)}</div>`;
    }
}

function _renderPatDirectoryResultItems(items) {
    const resultsEl = document.getElementById('pat-directory-results');
    const notFoundBtn = '<button type="button" class="pat-directory-not-found-link" onclick="patDirectoryGiveUpAndEnterManually()">Patient not found? Enter details manually</button>';

    if (!items || items.length === 0) {
        resultsEl.innerHTML = '<div class="pat-directory-result-empty">No matches found.</div>' + notFoundBtn;
        return;
    }

    const countLabel = items.length === 1 ? '1 matching patient' : `${items.length} matching patients`;
    let html = `<div class="pat-directory-result-count">${_escapeHtml(countLabel)}</div><div class="pat-directory-result-list">`;
    items.forEach((item, i) => {
        const meta = [_arabicSexLabel(item.sex), item.age != null ? `العمر ${item.age}` : null, `رقم المريض ${item.patient_id}`]
            .filter(Boolean).join(' · ');
        html += `<button type="button" class="pat-directory-result-row" data-idx="${i}">` +
                    `<span class="pat-directory-result-radio"></span>` +
                    `<span class="pat-directory-result-avatar">👤</span>` +
                    `<span class="pat-directory-result-text">` +
                        `<span class="pat-directory-result-name">${_escapeHtml(item.full_name || '')}</span>` +
                        `<span class="pat-directory-result-meta">${_escapeHtml(meta)}</span>` +
                    `</span>` +
                `</button>`;
    });
    html += '</div>' + notFoundBtn;
    resultsEl.innerHTML = html;
    resultsEl.querySelectorAll('.pat-directory-result-row').forEach(row => {
        row.onclick = () => selectPatDirectoryResult(items[parseInt(row.dataset.idx, 10)]);
    });
}

function patDirectoryGiveUpAndEnterManually() {
    ['pat-directory-patient-id', 'pat-directory-first-name', 'pat-directory-father-name', 'pat-directory-last-name']
        .forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('pat-directory-results').hidden = true;
    document.getElementById('pat-directory-guess-row').hidden = true;
    const panel = document.getElementById('pat-a-isbar-panel');
    if (panel && panel.dataset.mode === 'disabled') setPatFormMode('draft');
    const nameField = document.getElementById('pat-name');
    if (nameField) nameField.focus();
}

function _patDirectoryStatusMessage(status, message) {
    if (status === 'disabled') return 'Hospital Directory API is not configured (see Settings → Hospital Directory API).';
    return message || 'Hospital Directory search is currently unavailable.';
}

function selectPatDirectoryResult(item) {
    document.getElementById('pat-name').value = item.full_name || '';
    if (item.age != null) document.getElementById('pat-age').value = item.age;

    const mappedGender = _mapDirectorySexToGender(item.sex);
    if (mappedGender) document.getElementById('pat-gender').value = mappedGender;

    patDirectoryLinked = {
        external_patient_id: item.patient_id,
        full_name:           item.full_name || '',
    };

    document.getElementById('pat-directory-results').hidden = true;
    document.getElementById('pat-directory-guess-row').hidden = true;
    ['pat-directory-patient-id', 'pat-directory-first-name', 'pat-directory-father-name', 'pat-directory-last-name']
        .forEach(id => { document.getElementById(id).value = ''; });
    _renderPatDirectoryLinked();
    // Unlock the (still-empty, not-yet-created) form so the prefilled name
    // is visible and the rest of the entry can be completed — only when
    // nothing is already active, so a directory search never displaces an
    // in-progress selected stay.
    const panel = document.getElementById('pat-a-isbar-panel');
    if (panel && panel.dataset.mode === 'disabled') setPatFormMode('draft');
    refreshPatientCoreSectionStatus();
}

function clearPatDirectoryLink() {
    patDirectoryLinked = null;
    _renderPatDirectoryLinked();
}

function _renderPatDirectoryLinked() {
    const searchUi = document.getElementById('pat-directory-search-ui');
    const resolved = document.getElementById('pat-directory-resolved');
    if (!patDirectoryLinked) {
        searchUi.hidden = false;
        resolved.hidden = true;
        resolved.innerHTML = '';
        return;
    }
    // The resolved name takes over the field visually (like a filled-in
    // autocomplete box) instead of leaving the search inputs empty next to
    // a separate confirmation line below them.
    searchUi.hidden = true;
    resolved.hidden = false;
    resolved.innerHTML = `<span class="pat-directory-resolved-name">${_escapeHtml(patDirectoryLinked.full_name)}</span>` +
        `<span class="pat-directory-resolved-id">ID ${_escapeHtml(patDirectoryLinked.external_patient_id)}</span>` +
        `<span class="pat-directory-resolved-check">✓</span>` +
        `<button type="button" class="pat-directory-resolved-clear" onclick="clearPatDirectoryLink()" title="Change">✕</button>`;
}

function _mapDirectorySexToGender(sex) {
    // The vendor's allowed `sex` values are unconfirmed — only map unambiguous
    // matches to HCopilot's Male/Female options; never guess on anything else.
    if (!sex) return null;
    const v = String(sex).trim().toLowerCase();
    if (v === 'm' || v === 'male')   return 'Male';
    if (v === 'f' || v === 'female') return 'Female';
    return null;
}

function _arabicSexLabel(sex) {
    if (!sex) return null;
    const v = String(sex).trim().toLowerCase();
    if (v === 'm' || v === 'male')   return 'ذكر';
    if (v === 'f' || v === 'female') return 'أنثى';
    return null;
}

function _escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s == null ? '' : String(s);
    return div.innerHTML;
}

// ── ER Live-Roster picker (Addition tab) ────────────────────────────────────
// ER Live-Roster Redesign, slices ER6/ER9. Fetches the live "who's in the
// ER" feed and lets a nurse pick a name to create the stay immediately
// (record_source="external" + er_visit_id — relaxed-required server-side,
// see patient_management/api.py's check_required_by_origin), then opens the
// Edit modal to continue with vitals/ISBAR rather than duplicating that flow
// here. gender/age/chief_complaint from the roster are optional autofill
// only, never required at this step — their shapes aren't vendor-confirmed
// (same caution already applied to the Hospital Directory API's own `sex`
// field, which turned out to differ from its documented shape in practice).

let _patErRosterItems = [];

async function loadPatErRoster() {
    const statusEl  = document.getElementById('pat-er-roster-status');
    const resultsEl = document.getElementById('pat-er-roster-results');
    if (!resultsEl) return;
    if (statusEl) statusEl.textContent = 'Loading…';
    try {
        const res  = await fetch('/api/hospital-directory/er/current-visits');
        const data = await res.json();
        if (!data.success) {
            _patErRosterItems = [];
            if (statusEl) statusEl.textContent = _patDirectoryStatusMessage(data.status, data.message);
            resultsEl.innerHTML = '';
            resultsEl.hidden = true;
            return;
        }
        _patErRosterItems = data.items || [];
        _renderPatErRosterItems();
    } catch (error) {
        if (statusEl) statusEl.textContent = 'Network error: ' + error.message;
    }
}

function _renderPatErRosterItems() {
    const resultsEl = document.getElementById('pat-er-roster-results');
    const statusEl  = document.getElementById('pat-er-roster-status');
    if (!resultsEl) return;

    // ER UI Architecture Redesign, open question 1 (CONFIRMED: create on
    // pick) — an already-created stay for a roster entry (any active stay
    // carrying this er_visit_id) is no longer hidden from the list; it's
    // shown as "In Progress" and clicking it re-selects the existing stay
    // into the panel (selectPatStay) instead of creating a second one under
    // the same er_visit_id (deliberately not unique-constrained — see
    // db/models.py).
    const byVisitId = {};
    (allPatientsData || []).forEach(p => { if (p.er_visit_id) byVisitId[String(p.er_visit_id)] = p; });
    const items = _patErRosterItems;
    const newCount = items.filter(i => !byVisitId[String(i.er_visit_id)]).length;

    if (statusEl) statusEl.textContent = `${newCount} of ${items.length} not yet added`;

    if (!items.length) {
        resultsEl.hidden = true;
        resultsEl.innerHTML = '';
        return;
    }

    resultsEl.hidden = false;
    resultsEl.innerHTML = '<div class="pat-directory-result-list">' + items.map((item, i) => {
        const existing = byVisitId[String(item.er_visit_id)];
        const isActive = !!existing && existing.stay_id === patActiveStayId;
        const name = [item.first_name, item.father_name, item.last_name].filter(Boolean).join(' ');
        const meta = [item.arrival_time ? _formatDatetime(item.arrival_time) : null, item.chief_complaint || null]
            .filter(Boolean).join(' · ');
        const rowCls = 'pat-directory-result-row pat-a-roster-row' +
            (existing ? ' pat-a-roster-row-added' : '') + (isActive ? ' pat-a-roster-row-active' : '');
        const chip = existing ? '<span class="pat-a-roster-chip">' + (isActive ? 'Selected' : 'In Progress') + '</span>' : '';
        return '<button type="button" class="' + rowCls + '" data-idx="' + i + '" data-er-visit-id="' + _escapeHtml(String(item.er_visit_id)) + '">' +
                   '<span class="pat-directory-result-radio"></span>' +
                   '<span class="pat-directory-result-avatar">🚑</span>' +
                   '<span class="pat-directory-result-text">' +
                       '<span class="pat-directory-result-name">' + _escapeHtml(name) + '</span>' +
                       '<span class="pat-directory-result-meta">' + _escapeHtml(meta) + '</span>' +
                   '</span>' +
                   chip +
               '</button>';
    }).join('') + '</div>';
    resultsEl.querySelectorAll('.pat-a-roster-row').forEach(row => {
        row.onclick = () => pickPatErRosterItem(items[parseInt(row.dataset.idx, 10)]);
    });
}

async function pickPatErRosterItem(item) {
    const statusEl = document.getElementById('pat-er-roster-status');
    const name = [item.first_name, item.father_name, item.last_name].filter(Boolean).join(' ');

    // Already created for this roster entry — re-select rather than re-create.
    const existing = (allPatientsData || []).find(p => String(p.er_visit_id) === String(item.er_visit_id));
    if (existing) {
        try {
            const detailsRes = await fetch('/api/patients/' + existing.stay_id + '/details');
            if (detailsRes.ok) { selectPatStay(await detailsRes.json()); return; }
        } catch (_) { /* fall through to re-fetch/create below only if this truly fails */ }
    }

    try {
        const idsRes = await fetch('/api/patients/next-ids');
        const ids    = await idsRes.json();

        const payload = {
            patient_id:    ids.next_patient_id,
            stay_id:       ids.next_stay_id,
            name,
            arrival_time:  _toDatetimeLocal(item.arrival_time) || _currentDatetimeLocal(),
            er_visit_id:   String(item.er_visit_id),
            record_source: 'external',
        };
        const mappedGender = _mapDirectorySexToGender(item.gender);
        if (mappedGender) payload.gender = mappedGender;
        if (item.age != null) payload.age = item.age;
        if (item.chief_complaint) payload.chiefcomplaint = item.chief_complaint;

        const res = await fetch('/api/patients/add', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const result = await res.json();
        if (!res.ok) {
            if (statusEl) statusEl.textContent = parseApiError(result.detail) || 'Failed to add patient.';
            return;
        }

        showMessage(name + ' added from the ER roster — continue with ISBAR below.', 'success');
        notifyDataChange('patient', 'Patient #' + payload.patient_id + ' added from the ER roster');
        await loadPatients();

        // ER UI Architecture Redesign — activate the ISBAR panel in place
        // instead of opening the Edit modal (the old ER9 pattern).
        const detailsRes = await fetch('/api/patients/' + payload.stay_id + '/details');
        const row = await detailsRes.json();
        selectPatStay(row);
    } catch (error) {
        if (statusEl) statusEl.textContent = 'Network error: ' + error.message;
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _currentDatetimeLocal() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function _toDatetimeLocal(v) {
    if (!v) return '';
    const s = String(v);
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) ? s.slice(0, 16) : '';
}

// Triage Time is a time-only picker (dt-picker-time, 2026-09-22 feedback —
// only the clock time matters, used to compute a wait duration; asking for
// a date too is noise since triage always happens the same day as
// arrival). These two helpers move between that bare "H:i" value and the
// full timestamp string the backend/rest of the app expects everywhere else.
function _extractTimeHHmm(v) {
    if (!v) return '';
    const m = String(v).match(/(\d{2}:\d{2})/);
    return m ? m[1] : '';
}

function _combineWithDatePart(timeStr, dateSourceStr) {
    if (!timeStr) return null;
    const datePart = (dateSourceStr ? String(dateSourceStr) : _currentDatetimeLocal()).slice(0, 10);
    return datePart + 'T' + timeStr;
}

function _formatDatetime(v) {
    if (!v) return '<span class="s-null-dash">–</span>';
    try {
        const d = new Date(v);
        if (isNaN(d)) return v;
        return d.toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
    } catch (_) { return v; }
}

// Compact "BP 120/80 · HR 82 · SpO2 98%" cell, reusing the same clinical
// color-coding already used by the wide-table hrCell/o2Cell helpers rather
// than inventing new thresholds. Temperature/RR stay available via the
// cell's title tooltip rather than as separate columns.
function vitalsSummaryCell(p) {
    if (p.sbp == null && p.dbp == null && p.heartrate == null && p.o2sat == null) {
        return '<span class="pat-vitals-cell not-recorded">Not recorded</span>';
    }
    const parts = [];
    if (p.sbp != null || p.dbp != null) parts.push('BP ' + (p.sbp ?? '–') + '/' + (p.dbp ?? '–'));
    if (p.heartrate != null) {
        const cls = (p.heartrate < 60 || p.heartrate > 100) ? 's-vital-warn' : 's-vital-ok';
        parts.push('<span class="' + cls + '">HR ' + p.heartrate + '</span>');
    }
    if (p.o2sat != null) {
        const cls = p.o2sat < 95 ? 's-vital-warn' : (p.o2sat >= 98 ? 's-vital-ok' : '');
        parts.push('<span class="' + cls + '">SpO₂ ' + p.o2sat + '%</span>');
    }
    let title = 'Temp ' + (p.temperature != null ? p.temperature + '°C' : '–') +
                  ' · RR ' + (p.resprate != null ? p.resprate : '–');
    if (p.isbar && p.isbar.vitals_measured_at) title += ' · Measured ' + _formatDatetime(p.isbar.vitals_measured_at);
    return '<span class="pat-vitals-cell" title="' + title + '">' + parts.join(' · ') + '</span>';
}

// Shows "None" in muted text rather than an empty cell, and only renders
// badges that actually apply — no empty placeholder chips — from the small
// ISBAR subset merged into /list by the backend.
function riskBadgesCell(isbar) {
    const badges = [];
    if (isbar) {
        if (isbar.allergies_status === 'Yes') badges.push(['allergy', '⚠️ Allergy']);
        if (isbar.fall_risk === 'Yes') badges.push(['fall', '🚶 Fall Risk']);
        if (isbar.pressure_injury_risk === 'Yes') badges.push(['pressure', '🟦 Pressure Risk']);
        if (isbar.isolation_precautions && isbar.isolation_precautions !== 'None') {
            badges.push(['isolation', '🦠 ' + isbar.isolation_precautions]);
        }
    }
    if (badges.length === 0) return '<span class="pat-flags-none">None</span>';
    return '<div class="pat-badges-cell">' + badges.map(([cls, label]) =>
        '<span class="pat-risk-badge ' + cls + '">' + label + '</span>').join('') + '</div>';
}

// Patient identity cell: "Unknown Patient" (muted) is clearer than a bare
// dash when name wasn't recorded — e.g. an unidentified emergency arrival.
function patIdentityCell(name, id) {
    const nameHtml = name
        ? '<div class="pat-identity-name">' + _isbarEsc(name) + '</div>'
        : '<div class="pat-identity-name unknown">Unknown Patient</div>';
    return nameHtml + '<span class="s-td-id" style="font-size:11px">#' + id + '</span>';
}

// Compact actions cell: View stays a full button (row-click is the other
// path in), Edit is an icon-only button, and Delete moves into a small
// "⋯" overflow menu so destructive styling isn't visible by default.
function patActionsCell(stayId, rowJson, viewAction, editAction, deleteAction) {
    return '<div style="display:flex;gap:6px;align-items:center;justify-content:flex-end">' +
        '<button class="s-action-btn s-view-btn" data-action="' + viewAction + '" data-stayid="' + stayId + '">👁️ View</button>' +
        '<button class="pat-icon-btn" data-action="' + editAction + '" data-row=\'' + _safeAttr(rowJson) + '\' title="Edit">✏️</button>' +
        '<div class="pat-row-menu">' +
            '<button class="pat-icon-btn" data-action="toggle-row-menu" title="More actions">⋯</button>' +
            '<div class="pat-row-menu-list" hidden>' +
                '<button class="pat-row-menu-item danger" data-action="' + deleteAction + '" data-stayid="' + stayId + '">🗑️ Delete</button>' +
            '</div>' +
        '</div>' +
    '</div>';
}

document.addEventListener('click', function(e) {
    const toggleBtn = e.target.closest('[data-action="toggle-row-menu"]');
    if (toggleBtn) {
        const list = toggleBtn.nextElementSibling;
        const wasHidden = list.hidden;
        document.querySelectorAll('.pat-row-menu-list').forEach(l => { l.hidden = true; });
        list.hidden = !wasHidden;
        return;
    }
    if (!e.target.closest('.pat-row-menu')) {
        document.querySelectorAll('.pat-row-menu-list').forEach(l => { l.hidden = true; });
    }
});

function peditAutoOccupation() {
    const arr = document.getElementById('pedit-arrival-time').value;
    const occ = document.getElementById('pedit-bed-occupation-time');
    if (arr && !occ.value) setDateTimeValue('pedit-bed-occupation-time', arr);
}

// ── Acuity / pain scale buttons + conditional O2 flow rate (add + edit) ──────
// Shared by the inline add form (prefix "pat") and the edit modal (prefix
// "pedit") — both write into the same hidden input id so the existing
// submitPatientForm()/saveEditPatient() field reads are unaffected.

const O2_SUPPORT_NEEDS_FLOW = ['nasal_cannula', 'simple_mask', 'non_rebreather'];

function _isbarPrefix(mode) { return mode === 'edit' ? 'pedit' : 'pat'; }

function selectPatAcuity(mode, val) {
    const prefix = _isbarPrefix(mode);
    document.getElementById(prefix + '-acuity').value = val;
    document.querySelectorAll('#' + prefix + '-acuity-scale .pat-scale-btn').forEach(b => {
        b.classList.toggle('selected', parseInt(b.dataset.acuity, 10) === val);
    });
    if (mode === 'add') isbarAddDirty = true;
}

function selectPatPain(mode, val) {
    const prefix = _isbarPrefix(mode);
    document.getElementById(prefix + '-pain').value = val;
    document.querySelectorAll('#' + prefix + '-pain-scale .pat-scale-btn').forEach(b => {
        b.classList.toggle('selected', b.dataset.pain === String(val));
    });
    if (mode === 'add') isbarAddDirty = true;
}

function toggleO2FlowRate(mode) {
    const prefix = _isbarPrefix(mode);
    const support = document.getElementById(prefix + '-o2-support').value;
    const wrap = document.getElementById(prefix + '-o2-flow-wrap');
    wrap.hidden = !O2_SUPPORT_NEEDS_FLOW.includes(support);
    if (wrap.hidden) document.getElementById(prefix + '-o2-flow-rate').value = '';
}

// Collects the hand-written "Initial Vital Signs" additions (not part of the
// metadata-driven sections) into the shape ISBARDetails expects.
//
// vitals_measured_at/vitals_recorded_by have no visible field (Wave 4 removed
// the metadata strip — it added weight without helping data entry) and are
// handled differently per mode:
//   - 'add' is the actual moment of first recording, so both are computed
//     fresh here (now + the logged-in user) and always sent.
//   - 'edit' omits them entirely. The backend's upsert() only touches fields
//     present in the payload (see isbar_manager.py), so leaving them out
//     preserves whoever originally recorded the vitals — editing an unrelated
//     field (e.g. fixing a typo) must not silently reattribute the vitals to
//     whoever happens to be editing right now.
function collectVitalsAdditions(mode) {
    const prefix = _isbarPrefix(mode);
    const val = id => { const el = document.getElementById(prefix + '-' + id); return el ? el.value.trim() : ''; };
    const out = {};
    if (val('blood-glucose') !== '') out.blood_glucose = parseFloat(val('blood-glucose'));
    if (val('o2-support') !== '') out.o2_support = val('o2-support');
    if (val('o2-flow-rate') !== '') out.o2_flow_rate = parseFloat(val('o2-flow-rate'));
    if (mode === 'add') {
        out.vitals_measured_at = _currentDatetimeLocal();
        const u = typeof currentUser === 'function' ? currentUser() : null;
        out.vitals_recorded_by = u ? (u.name || u.username || '') : '';
    }
    return out;
}

function resetVitalsAdditions(mode) {
    const prefix = _isbarPrefix(mode);
    ['blood-glucose', 'o2-support', 'o2-flow-rate'].forEach(id => {
        const el = document.getElementById(prefix + '-' + id);
        if (el) el.value = '';
    });
    const wrap = document.getElementById(prefix + '-o2-flow-wrap');
    if (wrap) wrap.hidden = true;
    document.querySelectorAll('#' + prefix + '-acuity-scale .pat-scale-btn, #' + prefix + '-pain-scale .pat-scale-btn')
        .forEach(b => b.classList.remove('selected'));
    document.getElementById(prefix + '-acuity').value = '';
    document.getElementById(prefix + '-pain').value = '';
}

// ── Auto-ID + Arrival Time Initialization ────────────────────────────────────

async function loadNextPatientIds() {
    try {
        const res  = await fetch('/api/patients/next-ids');
        const data = await res.json();
        if (!res.ok) return;
        document.getElementById('pat-patient-id').value = data.next_patient_id;
        document.getElementById('pat-stay-id').value    = data.next_stay_id;
    } catch (_) {}
}

// Real bug found by running the Playwright suite (not by inspection): this
// must be `async` and its own fetches must be awaited. pickPatErRosterItem()/
// createPatientFromForm() both do `await loadPatients()` (which calls this)
// and then immediately populate #pat-patient-id/#pat-stay-id via
// selectPatStay() with the just-created stay's real id — but
// loadNextPatientIds() was previously fire-and-forget, so its GET could
// still be in flight and resolve *after* selectPatStay(), clobbering the
// real id back to a "next available" placeholder (a race the old code never
// hit, since it wrote the roster-pick result into the separate `pedit-*`
// edit-modal fields, not the shared `pat-*` ones this redesign now reuses
// for both a fresh draft and an active stay).
async function initPatientForm() {
    // initPatientForm() re-runs on every loadPatients() call, including from
    // unrelated onDataChange events elsewhere in the app — only auto-fill the
    // "next available" id/arrival-time placeholders while the panel is truly
    // untouched (not mid-draft, not showing an already-active stay), or an
    // unrelated background refresh would silently overwrite in-progress data
    // (and, for an active stay, corrupt the id saveActivePatientForm() PUTs).
    if (!patActiveStayId && !isbarAddDirty) {
        await loadNextPatientIds();
        setDateTimeValue('pat-arrival-time', _currentDatetimeLocal());
    }
    await loadPatErRoster();

    // Mount the ISBAR accordion exactly once — see the guard's own comment
    // above for why this must not repeat.
    const mount = document.getElementById('isbar-accordion-add');
    if (mount && !mount.dataset.mounted) {
        mountIsbarAccordion('add');
        mount.dataset.mounted = '1';
        refreshPatientCoreSectionStatus();
        setPatFormMode('disabled');
    }
}

// ── Page A form mode: disabled / draft / active ─────────────────────────────
// ER UI Architecture Redesign — replaces the old collapsed "+ Add New Patient
// Stay" card. The ISBAR panel (#pat-a-isbar-panel) always occupies the same
// place on the page; only its *mode* changes:
//   'disabled' — no patient selected. Form stays visible but inert (confirmed
//                decision #1: disabled, not hidden) behind the placeholder.
//   'draft'    — a brand-new manual/directory entry being typed, not yet
//                created server-side (Cancel/Reset/Add Patient all apply).
//   'active'   — an existing stay (roster-origin or just-created) is loaded;
//                the identity banner replaces the placeholder and the footer
//                becomes a single Save action (submitPatientForm() branches
//                on this mode — see below).

function _setPatAccordionDisabled(disabled) {
    document.querySelectorAll('#pat-add-accordion input, #pat-add-accordion select, #pat-add-accordion textarea, #pat-add-accordion button')
        .forEach(el => { el.disabled = disabled; });
}

function setPatFormMode(mode) {
    const panel = document.getElementById('pat-a-isbar-panel');
    if (!panel) return;
    panel.dataset.mode = mode; // 'disabled' | 'draft' | 'active'

    document.getElementById('pat-a-placeholder').hidden = mode !== 'disabled';
    document.getElementById('pat-a-banner').hidden       = mode !== 'active';
    _setPatAccordionDisabled(mode === 'disabled');

    const footer = document.getElementById('pat-a-footer');
    if (footer) footer.hidden = mode === 'disabled';
    const cancelBtn = document.getElementById('pat-a-cancel-btn');
    const resetBtn  = document.getElementById('pat-a-reset-btn');
    if (cancelBtn) cancelBtn.hidden = mode !== 'draft';
    if (resetBtn)  resetBtn.hidden  = mode !== 'draft';
    const addBtn = document.getElementById('pat-add-btn');
    if (addBtn) addBtn.textContent = mode === 'active' ? '💾 Save ISBAR Entry' : '➕ Add Patient';
}

// Secondary fallback (directory search / manual entry) — collapsed by
// default per confirmed decision #4, expanded on demand.
function togglePatFallback() {
    const body = document.getElementById('pat-a-fallback-body');
    const toggle = document.getElementById('pat-a-fallback-toggle');
    if (!body) return;
    body.hidden = !body.hidden;
    if (toggle) toggle.classList.toggle('open', !body.hidden);
}

// Active Patients table — collapsed by default (2026-09-22 feedback: the
// roster/ISBAR panel above is this page's actual job; the table is a
// secondary browse/resume tool that doesn't need to dominate the page on
// every visit). Data still loads in the background regardless of collapse
// state, so it's ready the moment the user expands it.
function togglePatDatasetCollapse(forceExpanded) {
    const body = document.getElementById('pat-dataset-body');
    const btn = document.getElementById('pat-dataset-toggle-btn');
    if (!body) return;
    const expanded = forceExpanded !== undefined ? forceExpanded : body.hidden;
    body.hidden = !expanded;
    if (btn) btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

// Explicit "start typing without picking anything" affordance — unlocks the
// form for a brand-new manual entry (mode 'draft') without creating a stay
// yet; creation still happens on submit, same as directory-search entries.
function enterManualPatientEntry() {
    setPatFormMode('draft');
    const nameField = document.getElementById('pat-name');
    if (nameField) nameField.focus();
}

// Loads a full stay record (from a roster pick, an active-patients table
// "Edit", or a freshly-created stay) into the Page A panel and activates it
// in place — replaces the old openEditPatientModal() hand-off for daily
// stays entirely (ER UI Architecture Redesign, Page A: "no modal").
function selectPatStay(row) {
    patActiveStayId         = row.stay_id;
    patActiveIsRosterOrigin = row.record_source === 'external' && !!row.er_visit_id;
    patActiveErVisitId      = row.er_visit_id || null;

    document.getElementById('pat-patient-id').value = row.patient_id;
    document.getElementById('pat-stay-id').value    = row.stay_id;
    document.getElementById('pat-name').value       = row.name != null ? row.name : '';
    document.getElementById('pat-gender').value     = row.gender != null ? row.gender : '';
    document.getElementById('pat-age').value        = row.age != null ? row.age : '';
    setDateTimeValue('pat-arrival-time', row.arrival_time ? String(row.arrival_time).slice(0, 16) : _currentDatetimeLocal());
    // Not shown on this form (see the HTML comment at their old location) —
    // cached so a save doesn't overwrite a real bed assignment with null.
    patActiveBedOccupationTime = row.bed_occupation_time || null;
    setDateTimeValue('pat-triage-time', _extractTimeHHmm(row.triage_time));
    document.getElementById('pat-chiefcomplaint').value = row.chiefcomplaint != null ? row.chiefcomplaint : '';
    document.getElementById('pat-temperature').value = row.temperature != null ? row.temperature : '';
    document.getElementById('pat-heartrate').value    = row.heartrate   != null ? row.heartrate   : '';
    document.getElementById('pat-resprate').value     = row.resprate    != null ? row.resprate    : '';
    document.getElementById('pat-o2sat').value        = row.o2sat       != null ? row.o2sat       : '';
    document.getElementById('pat-sbp').value          = row.sbp         != null ? row.sbp         : '';
    document.getElementById('pat-dbp').value          = row.dbp         != null ? row.dbp         : '';
    resetVitalsAdditions('add');
    const painStr = row.pain != null ? String(row.pain) : '';
    if (['0','1','2','3','4','5','6','7','8','9','10'].includes(painStr)) selectPatPain('add', painStr);
    if (row.acuity != null) selectPatAcuity('add', Math.round(row.acuity));

    loadIsbarStateFromRecord('add', row.isbar || null);
    if (row.isbar) {
        const v = row.isbar;
        if (v.blood_glucose != null) document.getElementById('pat-blood-glucose').value = v.blood_glucose;
        if (v.o2_support) { document.getElementById('pat-o2-support').value = v.o2_support; toggleO2FlowRate('add'); }
        if (v.o2_flow_rate != null) document.getElementById('pat-o2-flow-rate').value = v.o2_flow_rate;
    }

    document.getElementById('pat-a-banner-name').textContent = row.name || 'Unnamed Patient';
    const metaBits = [];
    if (row.age != null) metaBits.push(row.age + ' y/o');
    if (row.gender) metaBits.push(row.gender);
    metaBits.push('Arrived ' + _formatDatetime(row.arrival_time));
    metaBits.push('Patient #' + row.patient_id);
    document.getElementById('pat-a-banner-meta').innerHTML = metaBits.join(' · ');

    setPatFormMode('active');
    setPatAddError('');
    setPatAddErrorSummary('');
    refreshPatientCoreSectionStatus();
    document.getElementById('isbar-details-patient-arrival-add').open = true;
    _renderPatErRosterItems(); // reflect the new "Selected" chip in the roster list
}

// "Change Patient" — returns to the disabled placeholder state. The stay
// itself is untouched server-side; it can be resumed again via the roster
// (now showing "In Progress") or the Active Patients table's Edit action.
function changeActivePatient() {
    patActiveStayId         = null;
    patActiveIsRosterOrigin = false;
    patActiveErVisitId      = null;
    patActiveBedOccupationTime = null;
    clearPatientForm();
    setPatFormMode('disabled');
    _renderPatErRosterItems();
}

// "Reset Form" — only shown in 'draft' mode; blanks the in-progress manual
// entry but keeps the panel unlocked for continued typing.
function resetPatDraftForm() {
    clearPatientForm();
    setPatFormMode('draft');
}

function cancelAddPatientForm() {
    if (isbarAddDirty || _patVal('pat-name') || _patVal('pat-chiefcomplaint')) {
        if (!confirm('Discard this in-progress patient entry?')) return;
    }
    clearPatientForm();
    setPatFormMode('disabled');
}

// Opens a section by id (any mode) and scrolls it into view — used by the
// "Continue to Vital Signs →" affordance and by validation-failure handling.
function openIsbarSection(mode, sectionId) {
    const details = document.getElementById(`isbar-details-${sectionId}-${mode}`);
    if (!details) return;
    details.open = true;
    details.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── Patient & Arrival (mandatory) / Initial Vital Signs (fully optional) ────

function refreshPatientCoreSectionStatus() {
    const requiredArrival = ['pat-name', 'pat-gender', 'pat-age', 'pat-arrival-time', 'pat-chiefcomplaint', 'pat-acuity'];
    updateIsbarCoreSectionStatus('add', 'patient-arrival', requiredArrival,
        id => document.getElementById(id).value, false,
        _patVal('pat-chiefcomplaint') || null);

    // Every vital is independently optional — no all-or-nothing grouping,
    // so this is never blocking (enforceRequired=false).
    const requiredVitals = ['pat-temperature', 'pat-heartrate', 'pat-resprate', 'pat-o2sat', 'pat-sbp', 'pat-dbp', 'pat-pain'];
    updateIsbarCoreSectionStatus('add', 'vitals', requiredVitals,
        id => document.getElementById(id).value, false, null, false);

    updatePatAddRequiredRemaining();
}

function updatePatAddRequiredRemaining() {
    const el = document.getElementById('pat-add-required-remaining');
    if (!el) return;
    // Only Patient & Arrival is unconditionally required to add a patient —
    // Vitals and the ISBAR sections are optional-but-all-or-nothing once
    // started (see their own section status pills for that).
    const requiredIds = ['pat-name', 'pat-gender', 'pat-age', 'pat-arrival-time', 'pat-chiefcomplaint', 'pat-acuity'];
    const remaining = requiredIds.filter(id => !document.getElementById(id).value).length;
    el.textContent = remaining > 0 ? `Required fields remaining: ${remaining}` : 'All required fields complete';
}

document.addEventListener('DOMContentLoaded', function() {
    const accordion = document.getElementById('pat-add-accordion');
    if (!accordion) return;
    accordion.addEventListener('input', refreshPatientCoreSectionStatus);
    accordion.addEventListener('change', refreshPatientCoreSectionStatus);
    accordion.addEventListener('click', e => {
        // Scale buttons are plain <button> elements — clicking one fires
        // neither 'input' nor 'change', so status must be refreshed here.
        if (e.target.closest('.pat-scale-btn')) refreshPatientCoreSectionStatus();
    });
    // A directory selection sets #pat-name's value programmatically, which
    // does not fire 'input' — so this only ever fires from real user
    // keystrokes, exactly when the linked identity no longer matches what's
    // displayed and the link should be dropped.
    const nameField = document.getElementById('pat-name');
    if (nameField) {
        nameField.addEventListener('input', () => {
            if (patDirectoryLinked) clearPatDirectoryLink();
        });
    }
});

// ── Load & Render ─────────────────────────────────────────────────────────────

async function _loadPatientBedMap() {
    // Join patient_bed relations with the beds list to know each patient's current bed
    try {
        const [pbRes, bedsRes] = await Promise.all([
            fetch('/api/relations/patient_bed'),
            fetch('/api/beds/list'),
        ]);
        const pb   = await pbRes.json();
        const beds = await bedsRes.json();
        const bedsById = {};
        (beds.beds || []).forEach(b => { bedsById[b.bed_id] = b; });
        const map = {};
        (pb.rows || []).forEach(r => {
            const b = bedsById[r.bed_id];
            if (b) map[r.patient_id] = b;
        });
        patientBedMap = map;
    } catch (_) {
        patientBedMap = {};
    }
}

async function loadPatients() {
    const container = document.getElementById('patients-table-container');
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading patients...</div>';
    document.getElementById('pat-stats-bar').style.display  = 'none';
    document.getElementById('pat-filter-bar').style.display = 'none';

    try {
        const [listRes, statsRes] = await Promise.all([
            fetch('/api/patients/list'),
            fetch('/api/patients/stats')
        ]);
        const listData  = await listRes.json();
        const statsData = await statsRes.json();
        if (!listRes.ok)  throw new Error(listData.detail  || 'HTTP ' + listRes.status);
        if (!statsRes.ok) throw new Error(statsData.detail || 'HTTP ' + statsRes.status);

        await _loadPatientBedMap();
        allPatientsData = listData.patients;
        patCurrentPage  = 1;

        if (allPatientsData.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-icon">🧑‍⚕️</div><h3>No Patient Stays Found</h3><p>Use the form above to add your first patient stay.</p></div>';
            return;
        }

        document.getElementById('pat-stat-total').textContent    = statsData.total;
        document.getElementById('pat-stat-subjects').textContent = statsData.unique_subjects;
        document.getElementById('pat-stats-bar').style.display   = 'flex';
        document.getElementById('pat-search').value = '';
        document.getElementById('pat-filter-bar').style.display  = 'flex';

        renderPatientsTable(allPatientsData);
        await initPatientForm();
    } catch (error) {
        container.innerHTML = '<div class="error-state"><div class="error-icon">❌</div><h3>Error Loading Data</h3><p>' + error.message + '</p></div>';
    }
}

function switchPatientView(view) {
    patActiveView = view;
    document.querySelectorAll('.pat-view-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.view === view)
    );
    const addCard = document.getElementById('pat-add-card');
    if (addCard) addCard.style.display = view === 'daily' ? '' : 'none';
    if (view === 'daily') {
        // "Addition" (ER Live-Roster Redesign) — active stays: freshly
        // picked off the live roster, or already in progress. The table
        // below still shows every active stay in full detail (search,
        // vitals, edit) — kept here deliberately rather than moved, so
        // browsing/editing an in-progress patient has a surviving home
        // now that History (below) is departed-only.
        document.getElementById('pat-dataset-card-title').textContent    = '➕ Addition — Active Patients';
        document.getElementById('pat-dataset-card-subtitle').textContent = 'Patients currently in the ER, from the live roster or entered manually';
        patCurrentPage = 1;
        renderPatientsTable(allPatientsData);
        document.getElementById('pat-stats-bar').style.display  = allPatientsData.length ? 'flex' : 'none';
        document.getElementById('pat-filter-bar').style.display = allPatientsData.length ? 'flex' : 'none';
    } else {
        // "History" — departed-only (unchanged from the former "Patient Log").
        document.getElementById('pat-dataset-card-title').textContent    = '📜 History';
        document.getElementById('pat-dataset-card-subtitle').textContent = 'Discharged patients archive';
        loadPatientLog();
    }
}

async function loadPatientLog() {
    const container = document.getElementById('patients-table-container');
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading patient log...</div>';
    document.getElementById('pat-stats-bar').style.display  = 'none';
    document.getElementById('pat-filter-bar').style.display = 'none';
    try {
        const [listRes, statsRes] = await Promise.all([
            fetch('/api/data/log-patients/list'),
            fetch('/api/data/log-patients/stats')
        ]);
        const listData  = await listRes.json();
        const statsData = await statsRes.json();
        if (!listRes.ok) throw new Error(listData.detail || 'HTTP ' + listRes.status);

        allPatLogData  = listData.patients;
        patCurrentPage = 1;

        document.getElementById('pat-stat-total').textContent    = statsData.total;
        document.getElementById('pat-stat-subjects').textContent = statsData.unique_subjects;
        document.getElementById('pat-stats-bar').style.display   = 'flex';
        document.getElementById('pat-search').value = '';
        document.getElementById('pat-filter-bar').style.display  = 'flex';

        if (allPatLogData.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-icon">📁</div><h3>No Discharged Patients Yet</h3><p>Discharged patients will appear here after discharge.</p></div>';
            return;
        }
        renderLogPatientsTable(allPatLogData);
    } catch (error) {
        container.innerHTML = '<div class="error-state"><div class="error-icon">❌</div><h3>Error Loading Log</h3><p>' + error.message + '</p></div>';
    }
}

function patPaginationHtml(totalPages) {
    const atFirst = patCurrentPage <= 1;
    const atLast  = patCurrentPage >= totalPages;
    return '<div class="pat-pagination">' +
        '<div class="pat-pagination-controls">' +
            '<button class="pat-pagination-btn" onclick="patGoToPage(1)" ' + (atFirst ? 'disabled' : '') + '>⏮ First</button>' +
            '<button class="pat-pagination-btn" onclick="patGoToPage(\'prev\')" ' + (atFirst ? 'disabled' : '') + '>◀ Prev</button>' +
            '<button class="pat-pagination-btn" onclick="patGoToPage(\'next\')" ' + (atLast ? 'disabled' : '') + '>Next ▶</button>' +
            '<button class="pat-pagination-btn" onclick="patGoToPage(\'last\')" ' + (atLast ? 'disabled' : '') + '>Last ⏭</button>' +
        '</div>' +
        '<div class="pat-pagination-info">Page ' + patCurrentPage + ' of ' + totalPages + '</div>' +
    '</div>';
}

function patGoToPage(page) {
    const totalPages = Math.max(1, Math.ceil(patFilteredData.length / patPageSize));
    if (page === 'prev') patCurrentPage = Math.max(1, patCurrentPage - 1);
    else if (page === 'next') patCurrentPage = Math.min(totalPages, patCurrentPage + 1);
    else if (page === 'last') patCurrentPage = totalPages;
    else patCurrentPage = page;

    if (patActiveView === 'log') renderLogPatientsTable(patFilteredData);
    else renderPatientsTable(patFilteredData);
}

function renderLogPatientsTable(patients) {
    const container = document.getElementById('patients-table-container');
    const countEl   = document.getElementById('pat-visible-count');
    if (countEl) countEl.textContent = patients.length + ' record' + (patients.length !== 1 ? 's' : '');

    if (patients.length === 0) {
        container.innerHTML = '<div class="s-no-results"><div class="s-no-results-icon">🔍</div><p>No records match your filters.</p></div>';
        return;
    }

    patFilteredData = patients;
    const totalPages = Math.max(1, Math.ceil(patients.length / patPageSize));
    patCurrentPage = Math.min(Math.max(1, patCurrentPage), totalPages);
    const start    = (patCurrentPage - 1) * patPageSize;
    const pageRows = patients.slice(start, start + patPageSize);

    const dash = '<span class="s-null-dash">–</span>';

    const acuityBadge = v => {
        if (v == null) return dash;
        const lvl = Math.round(v);
        const cls = (lvl >= 1 && lvl <= 5) ? 's-acuity-' + lvl : '';
        const labels = { 1:'Immediate', 2:'Emergent', 3:'Urgent', 4:'Less Urgent', 5:'Non-Urgent' };
        return '<span class="s-acuity ' + cls + '" title="' + (labels[lvl] || lvl) + '">' + v + '</span>';
    };

    const destinationBadge = v => {
        if (!v) return dash;
        const isHome = v === 'Home';
        const bg = isHome ? '#dcfce7' : '#dbeafe';
        const fg = isHome ? '#166534' : '#1e40af';
        const icon = isHome ? '🏠' : '🏥';
        return '<span style="background:' + bg + ';color:' + fg + ';border-radius:6px;padding:2px 8px;font-size:12px;white-space:nowrap">' + icon + ' ' + v + '</span>';
    };

    const rows = pageRows.map(p =>
        '<tr class="pat-row" data-view-stayid="' + p.stay_id + '">' +
        '<td>' + patIdentityCell(p.name, p.subject_id) + '</td>' +
        '<td class="s-td-id">' + p.stay_id + '</td>' +
        '<td class="pat-td-arrival">' + _formatDatetime(p.arrival_time) + '</td>' +
        '<td>' + destinationBadge(p.destination) + '</td>' +
        '<td>' + acuityBadge(p.acuity) + '</td>' +
        '<td>' + vitalsSummaryCell(p) + '</td>' +
        '<td>' + riskBadgesCell(p.isbar) + '</td>' +
        '<td class="s-td-actions">' +
            patActionsCell(p.stay_id, JSON.stringify(p), 'view-log-patient-details', 'edit-log-patient', 'delete-log-patient') +
        '</td>' +
        '</tr>'
    ).join('');

    container.innerHTML =
        '<div class="s-table-wrap"><table class="s-table">' +
        '<thead><tr>' +
        '<th>Patient</th><th>Stay ID</th><th>Arrival</th><th>Destination</th><th>Acuity</th>' +
        '<th>Vitals</th><th>Flags</th>' +
        '<th style="width:220px">Actions</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
        '</table></div>' +
        '<div class="s-table-footer">Showing ' + (start + 1) + '–' + (start + pageRows.length) + ' of ' + patients.length + ' record' + (patients.length !== 1 ? 's' : '') +
        (patients.length < allPatLogData.length ? ' <span class="s-filter-hint">(filtered from ' + allPatLogData.length + ' total)</span>' : '') +
        '</div>' +
        (totalPages > 1 ? patPaginationHtml(totalPages) : '');
}

function filterPatients() {
    const search = document.getElementById('pat-search').value.toLowerCase().trim();
    patCurrentPage = 1; // every filter change restarts pagination at page 1
    if (patActiveView === 'log') {
        const filtered = allPatLogData.filter(p =>
            !search
            || String(p.subject_id).includes(search)
            || String(p.stay_id).includes(search)
            || (p.name && p.name.toLowerCase().includes(search))
            || (p.chiefcomplaint && p.chiefcomplaint.toLowerCase().includes(search))
        );
        renderLogPatientsTable(filtered);
    } else {
        const filtered = allPatientsData.filter(p =>
            !search
            || String(p.patient_id).includes(search)
            || String(p.stay_id).includes(search)
            || (p.name && p.name.toLowerCase().includes(search))
            || (p.chiefcomplaint && p.chiefcomplaint.toLowerCase().includes(search))
        );
        renderPatientsTable(filtered);
    }
}

function renderPatientsTable(patients) {
    const container = document.getElementById('patients-table-container');
    const countEl   = document.getElementById('pat-visible-count');
    if (countEl) countEl.textContent = patients.length + ' record' + (patients.length !== 1 ? 's' : '');

    if (patients.length === 0) {
        container.innerHTML = '<div class="s-no-results"><div class="s-no-results-icon">🔍</div><p>No records match your filters.</p></div>';
        return;
    }

    patFilteredData = patients;
    const totalPages = Math.max(1, Math.ceil(patients.length / patPageSize));
    patCurrentPage = Math.min(Math.max(1, patCurrentPage), totalPages);
    const start    = (patCurrentPage - 1) * patPageSize;
    const pageRows = patients.slice(start, start + patPageSize);

    const dash = '<span class="s-null-dash">–</span>';

    const acuityBadge = v => {
        if (v == null) return dash;
        const lvl = Math.round(v);
        const cls = (lvl >= 1 && lvl <= 5) ? 's-acuity-' + lvl : '';
        const labels = { 1:'Immediate', 2:'Emergent', 3:'Urgent', 4:'Less Urgent', 5:'Non-Urgent' };
        return '<span class="s-acuity ' + cls + '" title="' + (labels[lvl] || lvl) + '">' + v + '</span>';
    };

    const bedCell = p => {
        const b = patientBedMap[p.patient_id];
        if (!b) return dash;
        const btype = b.bed_type || 'normal';
        return '<span class="s-bed-num-pill">' + b.bed_number + '</span> ' +
               '<span class="bed-type-badge type-' + btype.toLowerCase() + '">' + btype + '</span>';
    };

    const rows = pageRows.map(p =>
        '<tr class="pat-row" data-view-stayid="' + p.stay_id + '">' +
        '<td>' + patIdentityCell(p.name, p.patient_id) + '</td>' +
        '<td class="s-td-id">' + p.stay_id + '</td>' +
        '<td class="pat-td-arrival">' + _formatDatetime(p.arrival_time) + '</td>' +
        '<td>' + bedCell(p) + '</td>' +
        '<td>' + acuityBadge(p.acuity) + '</td>' +
        '<td>' + vitalsSummaryCell(p) + '</td>' +
        '<td>' + riskBadgesCell(p.isbar) + '</td>' +
        '<td class="s-td-actions">' +
            patActionsCell(p.stay_id, JSON.stringify(p), 'view-patient-details', 'edit-patient', 'delete-patient') +
        '</td>' +
        '</tr>'
    ).join('');

    container.innerHTML =
        '<div class="s-table-wrap"><table class="s-table">' +
        '<thead><tr>' +
        '<th>Patient</th><th>Stay ID</th><th>Arrival</th><th>Bed</th><th>Acuity</th>' +
        '<th>Vitals</th><th>Flags</th>' +
        '<th style="width:220px">Actions</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
        '</table></div>' +
        '<div class="s-table-footer">Showing ' + (start + 1) + '–' + (start + pageRows.length) + ' of ' + patients.length + ' record' + (patients.length !== 1 ? 's' : '') +
        (patients.length < allPatientsData.length
            ? ' <span class="s-filter-hint">(filtered from ' + allPatientsData.length + ' total)</span>'
            : '') +
        '</div>' +
        (totalPages > 1 ? patPaginationHtml(totalPages) : '');
}

document.addEventListener('click', function(e) {
    const editBtn       = e.target.closest('[data-action="edit-patient"]');
    const editLogBtn    = e.target.closest('[data-action="edit-log-patient"]');
    const delBtn        = e.target.closest('[data-action="delete-patient"]');
    const delLogBtn     = e.target.closest('[data-action="delete-log-patient"]');
    const viewBtn       = e.target.closest('[data-action="view-patient-details"]');
    const viewLogBtn    = e.target.closest('[data-action="view-log-patient-details"]');
    // ER UI Architecture Redesign — editing an active (daily) stay loads it
    // into the Page A panel in place; the modal stays in use for log/History
    // rows only until Page C (UI-C*) replaces that view too.
    if (editBtn) {
        fetch('/api/patients/' + JSON.parse(editBtn.dataset.row).stay_id + '/details')
            .then(r => r.ok ? r.json() : null)
            .then(row => { if (row) { selectPatStay(row); document.querySelector('.pat-a-layout')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
    }
    if (editLogBtn) openEditPatientModal(JSON.parse(editLogBtn.dataset.row), 'log');
    if (delBtn)     confirmDeletePatient(parseInt(delBtn.dataset.stayid),    'daily');
    if (delLogBtn)  confirmDeletePatient(parseInt(delLogBtn.dataset.stayid), 'log');
    if (viewBtn || viewLogBtn) {
        openPatientDetailsModal(parseInt((viewBtn || viewLogBtn).dataset.stayid));
        return;
    }

    // Row click (excluding the Actions cell, to avoid double-triggering with
    // its own buttons) also opens Patient Details — the primary "inspect
    // this patient" path per the compact-table design.
    const row = e.target.closest('.pat-row');
    if (row && !e.target.closest('.s-td-actions')) {
        openPatientDetailsModal(parseInt(row.dataset.viewStayid));
    }
});

// ── Inline Add Form ───────────────────────────────────────────────────────────

function _patVal(id)   { return document.getElementById(id).value.trim(); }
function _patFloat(id) { const v = _patVal(id); return v === '' ? null : parseFloat(v); }
function _patInt(id)   { const v = _patVal(id); return v === '' ? null : parseInt(v); }

function setPatAddError(msg) {
    const el = document.getElementById('pat-add-error');
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
}

function setPatAddErrorSummary(msg) {
    const el = document.getElementById('pat-add-error-summary');
    if (!el) return;
    if (!msg) { el.hidden = true; el.innerHTML = ''; return; }
    const parts = msg.split(';').map(s => s.trim()).filter(Boolean);
    el.hidden = false;
    el.innerHTML = parts.length > 1
        ? '<strong>Please fix the following before saving:</strong><ul>' + parts.map(p => `<li>${_isbarEsc(p)}</li>`).join('') + '</ul>'
        : _isbarEsc(msg);
}

// Which accordion section each core field lives in, so a validation failure
// can open + scroll to the right place rather than leaving the user to hunt
// for the error inside a collapsed section.
const PAT_FIELD_SECTION = {
    'pat-name': 'patient-arrival', 'pat-gender': 'patient-arrival', 'pat-age': 'patient-arrival',
    'pat-arrival-time': 'patient-arrival', 'pat-chiefcomplaint': 'patient-arrival', 'pat-acuity': 'patient-arrival',
    'pat-temperature': 'vitals', 'pat-heartrate': 'vitals', 'pat-resprate': 'vitals', 'pat-o2sat': 'vitals',
    'pat-sbp': 'vitals', 'pat-dbp': 'vitals', 'pat-pain': 'vitals',
};

function failPatAddValidation(msg, fieldId) {
    setPatAddError(msg);
    const sectionId = PAT_FIELD_SECTION[fieldId];
    if (sectionId) openIsbarSection('add', sectionId);
}

// Every vital is independently optional — only range-validate whichever
// ones were actually entered; no vital's presence requires any other (only
// Patient & Arrival is unconditionally required to add a patient). Returns
// {key, msg} on failure (key is the bare field name, e.g. 'temperature' —
// callers prefix it with their own DOM id scheme), or null if every
// provided value is in range.
function validateVitalsGroup(vals) {
    const checks = [
        ['temperature', vals.temperature, 26, 46, '°C', 'Temperature'],
        ['heartrate',   vals.heartrate,   20, 300, 'bpm', 'Heart rate'],
        ['resprate',    vals.resprate,    4, 100, 'breaths/min', 'Resp. rate'],
        ['o2sat',       vals.o2sat,       0, 100, '%', 'O₂ saturation'],
        ['sbp',         vals.sbp,         40, 300, 'mmHg', 'SBP'],
        ['dbp',         vals.dbp,         20, 200, 'mmHg', 'DBP'],
    ];
    for (const [key, v, min, max, unit, label] of checks) {
        if (v !== null && (v < min || v > max)) {
            return { key, msg: `${label} must be between ${min} and ${max} ${unit}.` };
        }
    }
    return null;
}

function clearPatientForm() {
    ['pat-name','pat-gender','pat-age',
     'pat-temperature','pat-heartrate','pat-resprate',
     'pat-o2sat','pat-sbp','pat-dbp','pat-pain','pat-acuity','pat-chiefcomplaint']
        .forEach(id => { document.getElementById(id).value = ''; });
    setDateTimeValue('pat-triage-time', ''); // dt-picker-time — needs the picker's own clear, not a raw .value reset
    patActiveBedOccupationTime = null;
    resetVitalsAdditions('add');
    resetIsbarState('add');
    setPatAddError('');
    setPatAddErrorSummary('');
    ['pat-directory-patient-id', 'pat-directory-first-name', 'pat-directory-father-name', 'pat-directory-last-name']
        .forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('pat-directory-results').hidden = true;
    document.getElementById('pat-directory-guess-row').hidden = true;
    switchPatDirectoryTab('name');
    clearPatDirectoryLink();
    initPatientForm();
    refreshPatientCoreSectionStatus();
}

// Dispatches to the create path (fresh manual/directory draft) or the save
// path (an already-active stay, roster-origin or otherwise) depending on the
// panel's current mode — see setPatFormMode() above.
async function submitPatientForm() {
    const panel = document.getElementById('pat-a-isbar-panel');
    if (panel && panel.dataset.mode === 'active') return saveActivePatientForm();
    return createPatientFromForm();
}

async function createPatientFromForm() {
    const patientId = _patInt('pat-patient-id');
    const stayId    = _patInt('pat-stay-id');
    const temp      = _patFloat('pat-temperature');
    const hr        = _patFloat('pat-heartrate');
    const rr        = _patFloat('pat-resprate');
    const o2        = _patFloat('pat-o2sat');
    const sbp       = _patFloat('pat-sbp');
    const dbp       = _patFloat('pat-dbp');
    const acuity    = _patFloat('pat-acuity');
    const arrival   = _patVal('pat-arrival-time') || null;
    // Freshly created — no discharge or bed assignment has happened yet.
    const triageTime = _combineWithDatePart(_patVal('pat-triage-time'), arrival);
    const age       = _patInt('pat-age');
    const name      = _patVal('pat-name');
    const gender    = _patVal('pat-gender');
    const pain      = _patVal('pat-pain');
    const chiefcomplaint = _patVal('pat-chiefcomplaint');

    setPatAddError('');
    setPatAddErrorSummary('');
    if (!patientId || patientId < 1) { failPatAddValidation('Patient ID must be a positive integer.', 'pat-patient-id'); return; }
    if (!stayId    || stayId    < 1) { failPatAddValidation('Stay ID must be a positive integer.', 'pat-stay-id'); return; }
    if (!name)                { failPatAddValidation('Name is required.', 'pat-name'); return; }
    if (!gender)               { failPatAddValidation('Gender is required.', 'pat-gender'); return; }
    if (age    === null || age    < 0)                      { failPatAddValidation('Age is required and must be a positive number.', 'pat-age'); return; }
    if (!arrival)              { failPatAddValidation('Arrival time is required.', 'pat-arrival-time'); return; }
    if (acuity === null || acuity < 1   || acuity > 5)   { failPatAddValidation('Acuity is required and must be between 1 and 5.', 'pat-acuity'); return; }
    if (!chiefcomplaint)       { failPatAddValidation('Chief complaint is required.', 'pat-chiefcomplaint'); return; }

    // Initial Vital Signs and the 4 ISBAR sections are fully optional —
    // only range-validate whichever vitals were actually entered.
    const vitalsErr = validateVitalsGroup({ temperature: temp, heartrate: hr, resprate: rr, o2sat: o2, sbp, dbp, pain });
    if (vitalsErr) { failPatAddValidation(vitalsErr.msg, 'pat-' + vitalsErr.key); return; }

    const payload = {
        patient_id:          patientId,
        stay_id:             stayId,
        name,
        gender,
        age,
        arrival_time:        arrival,
        departure_time:      null,
        bed_occupation_time: null,
        triage_time:         triageTime,
        temperature:         temp,
        heartrate:           hr,
        resprate:            rr,
        o2sat:               o2,
        sbp,
        dbp,
        pain,
        acuity,
        chiefcomplaint,
        external_patient_id: patDirectoryLinked ? patDirectoryLinked.external_patient_id : null,
        external_visit_id:   null, // no visit concept in this Hospital Directory API version
        record_source:       patDirectoryLinked ? 'external' : 'local',
    };
    const isbarPayload = buildIsbarPayload('add', collectVitalsAdditions('add'));
    if (isbarPayload) payload.isbar = isbarPayload;

    const btn = document.getElementById('pat-add-btn');
    btn.disabled = true; btn.textContent = 'Adding…';

    try {
        const response = await fetch('/api/patients/add', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) {
            const errMsg = parseApiError(result.detail) || 'Error ' + response.status;
            setPatAddError(errMsg);
            setPatAddErrorSummary(errMsg);
            // A backend-rejected ISBAR conditional-validation error means the
            // Situation/Background/Focused/Recommendation sections hold the
            // problem — Patient & Arrival/Vitals already passed client-side
            // checks above, so open the metadata accordion generally rather
            // than guessing which of the 4 sections.
            if (errMsg.toLowerCase().includes('isbar') || errMsg.includes('allergy') || errMsg.includes('o2_')) {
                ['situation', 'background', 'focused', 'recommendation'].forEach(id => {
                    const d = document.getElementById(`isbar-details-${id}-add`);
                    if (d) d.open = true;
                });
            }
            return;
        }
        setPatAddErrorSummary('');
        showMessage(result.message, 'success');
        notifyDataChange('patient', `Patient #${patientId} added to daily patients`);
        await loadPatients();
        // Activate the just-created stay in place instead of collapsing the
        // form — continuing ISBAR entry is the very next thing to do.
        try {
            const detailsRes = await fetch('/api/patients/' + stayId + '/details');
            if (detailsRes.ok) selectPatStay(await detailsRes.json());
        } catch (_) { /* stay in draft mode; the table below still shows the new stay */ }
    } catch (error) {
        setPatAddError('Network error: ' + error.message);
    } finally {
        btn.disabled = false;
        const m = document.getElementById('pat-a-isbar-panel')?.dataset.mode;
        btn.textContent = m === 'active' ? '💾 Save ISBAR Entry' : '➕ Add Patient';
    }
}

// Saves edits to an already-active stay (patActiveStayId) in place — the
// Page A equivalent of saveEditPatient(), reading from the "pat-" prefixed
// fields instead of "pedit-". Mirrors its relaxed-required check exactly
// (patActiveIsRosterOrigin instead of patEditIsRosterOrigin).
async function saveActivePatientForm() {
    const patientId = _patInt('pat-patient-id');
    const temp      = _patFloat('pat-temperature');
    const hr        = _patFloat('pat-heartrate');
    const rr        = _patFloat('pat-resprate');
    const o2        = _patFloat('pat-o2sat');
    const sbp       = _patFloat('pat-sbp');
    const dbp       = _patFloat('pat-dbp');
    const acuity    = _patFloat('pat-acuity');
    const arrival   = _patVal('pat-arrival-time') || null;
    const triageTime = _combineWithDatePart(_patVal('pat-triage-time'), arrival);
    const age       = _patInt('pat-age');
    const name      = _patVal('pat-name');
    const gender    = _patVal('pat-gender');
    const pain      = _patVal('pat-pain');
    const chiefcomplaint = _patVal('pat-chiefcomplaint');

    setPatAddError('');
    setPatAddErrorSummary('');
    if (!patientId || patientId < 1) { failPatAddValidation('Patient ID must be a positive integer.', 'pat-patient-id'); return; }
    if (!name)     { failPatAddValidation('Name is required.', 'pat-name'); return; }
    if (!arrival)  { failPatAddValidation('Arrival time is required.', 'pat-arrival-time'); return; }
    // Mirrors saveEditPatient()'s check_required_by_origin parity exactly —
    // a roster-origin stay can be saved incrementally instead of all at once.
    if (!patActiveIsRosterOrigin) {
        if (!gender)  { failPatAddValidation('Gender is required.', 'pat-gender'); return; }
        if (age === null || age < 0) { failPatAddValidation('Age is required and must be a positive number.', 'pat-age'); return; }
        if (acuity === null || acuity < 1 || acuity > 5) { failPatAddValidation('Acuity is required and must be between 1 and 5.', 'pat-acuity'); return; }
        if (!chiefcomplaint) { failPatAddValidation('Chief complaint is required.', 'pat-chiefcomplaint'); return; }
    }

    const vitalsErr = validateVitalsGroup({ temperature: temp, heartrate: hr, resprate: rr, o2sat: o2, sbp, dbp, pain });
    if (vitalsErr) { failPatAddValidation(vitalsErr.msg, 'pat-' + vitalsErr.key); return; }

    const payload = {
        patient_id: patientId, name, gender, age,
        arrival_time: arrival,
        // Neither has an input on this form — departure never applies to an
        // active stay; bed_occupation_time is resent from the loaded record
        // (see patActiveBedOccupationTime) so it isn't wiped by mgr.modify()'s
        // unconditional overwrite whenever a bed has genuinely been assigned.
        departure_time: null, bed_occupation_time: patActiveBedOccupationTime,
        triage_time: triageTime, temperature: temp, heartrate: hr, resprate: rr,
        o2sat: o2, sbp, dbp, pain, acuity, chiefcomplaint,
    };
    // Real bug found by running the Playwright suite: the backend's
    // check_required_by_origin validator (patient_management/api.py) runs
    // on every PUT /modify too, not just POST /add — and it re-derives
    // roster-origin from THIS request's own record_source/er_visit_id
    // fields, not from anything already stored. Omitting them here made a
    // roster-origin stay's incremental (partial) save always 422 demanding
    // gender/age/acuity/chiefcomplaint, even though patActiveIsRosterOrigin
    // was correctly relaxing the client-side check above.
    if (patActiveIsRosterOrigin) {
        payload.record_source = 'external';
        payload.er_visit_id   = patActiveErVisitId;
    }
    const isbarPayload = buildIsbarPayload('add', collectVitalsAdditions('add'));
    if (isbarPayload) payload.isbar = isbarPayload;

    const btn = document.getElementById('pat-add-btn');
    btn.disabled = true; btn.textContent = 'Saving…';

    try {
        const response = await fetch('/api/patients/modify/' + patActiveStayId, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) {
            const errMsg = response.status < 500 ? (parseApiError(result.detail) || 'Error ' + response.status) : 'Save failed. Please try again.';
            setPatAddError(errMsg);
            setPatAddErrorSummary(errMsg);
            return;
        }
        showMessage(result.message, 'success');
        notifyDataChange('patient', `Patient #${patientId} (Stay #${patActiveStayId}) updated`);
        await loadPatients();
    } catch (error) {
        setPatAddError('Network error: ' + error.message);
    } finally {
        btn.disabled = false;
        const m = document.getElementById('pat-a-isbar-panel')?.dataset.mode;
        btn.textContent = m === 'active' ? '💾 Save ISBAR Entry' : '➕ Add Patient';
    }
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

function setPatEditError(msg) {
    const el = document.getElementById('patient-edit-error');
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
}

function openEditPatientModal(row, source) {
    patEditStayId  = row.stay_id;
    patEditSource  = source || 'daily';
    // See the patEditIsRosterOrigin declaration above — mirrors the
    // server's own check_required_by_origin condition exactly.
    patEditIsRosterOrigin = patEditSource !== 'log' && row.record_source === 'external' && !!row.er_visit_id;
    patEditErVisitId = row.er_visit_id || null;
    const prefix   = patEditSource === 'log' ? '📁 Edit Log Stay #' : 'Edit Stay #';
    document.getElementById('patient-edit-title').textContent = prefix + row.stay_id;
    // Log patients use subject_id; daily patients use patient_id — normalise here
    document.getElementById('pedit-patient-id').value          = row.patient_id ?? row.subject_id;
    document.getElementById('pedit-stay-id').value             = row.stay_id;
    document.getElementById('pedit-name').value                = row.name           != null ? row.name           : '';
    document.getElementById('pedit-gender').value              = row.gender         != null ? row.gender         : '';
    document.getElementById('pedit-age').value                 = row.age            != null ? row.age            : '';
    setDateTimeValue('pedit-arrival-time', row.arrival_time   ? String(row.arrival_time).slice(0, 16)   : _currentDatetimeLocal());
    setDateTimeValue('pedit-departure-time', row.departure_time ? String(row.departure_time).slice(0, 16) : '');
    setDateTimeValue('pedit-bed-occupation-time', _toDatetimeLocal(row.bed_occupation_time));
    setDateTimeValue('pedit-triage-time', _toDatetimeLocal(row.triage_time));
    document.getElementById('pedit-temperature').value         = row.temperature    != null ? row.temperature    : '';
    document.getElementById('pedit-heartrate').value           = row.heartrate      != null ? row.heartrate      : '';
    document.getElementById('pedit-resprate').value            = row.resprate       != null ? row.resprate       : '';
    document.getElementById('pedit-o2sat').value               = row.o2sat          != null ? row.o2sat          : '';
    document.getElementById('pedit-sbp').value                 = row.sbp            != null ? row.sbp            : '';
    document.getElementById('pedit-dbp').value                 = row.dbp            != null ? row.dbp            : '';
    document.getElementById('pedit-chiefcomplaint').value      = row.chiefcomplaint != null ? row.chiefcomplaint : '';
    resetVitalsAdditions('edit');
    const painStr = row.pain != null ? String(row.pain) : '';
    if (['0','1','2','3','4','5','6','7','8','9','10'].includes(painStr)) {
        selectPatPain('edit', painStr);
    } else {
        document.getElementById('pedit-pain').value = painStr; // free-text legacy value outside 0-10
    }
    if (row.acuity != null) selectPatAcuity('edit', Math.round(row.acuity));
    const destGroup = document.getElementById('pedit-destination-group');
    if (destGroup) destGroup.style.display = patEditSource === 'log' ? '' : 'none';
    splitDestination('pedit-destination', 'pedit-destination-detail', row.destination);
    setPatEditError('');

    // ISBAR editing is only offered for active (daily) stays for now — see
    // data_management/api.py's log-patients/modify endpoint, which doesn't
    // yet accept an isbar payload (intentionally deferred).
    const isbarWrap = document.getElementById('pedit-isbar-wrap');
    if (isbarWrap) isbarWrap.style.display = patEditSource === 'log' ? 'none' : '';
    if (patEditSource !== 'log') {
        mountIsbarAccordion('edit');
        fetch('/api/patients/' + row.stay_id + '/details')
            .then(r => r.ok ? r.json() : null)
            .then(details => {
                if (patEditStayId !== row.stay_id) return; // modal moved on to a different stay
                if (details && details.isbar) {
                    loadIsbarStateFromRecord('edit', details.isbar);
                    const v = details.isbar;
                    if (v.blood_glucose != null) document.getElementById('pedit-blood-glucose').value = v.blood_glucose;
                    if (v.o2_support) { document.getElementById('pedit-o2-support').value = v.o2_support; toggleO2FlowRate('edit'); }
                    if (v.o2_flow_rate != null) document.getElementById('pedit-o2-flow-rate').value = v.o2_flow_rate;
                    // No visible measured-at/recorded-by fields in the edit modal
                    // (Wave 4) — collectVitalsAdditions('edit') omits them from
                    // the save payload entirely, preserving whatever is stored.
                }
            })
            .catch(() => {});
    }

    document.getElementById('patient-edit-modal').style.display = 'block';
}

function closeEditPatientModal() {
    document.getElementById('patient-edit-modal').style.display = 'none';
    patEditStayId = null;
    patEditIsRosterOrigin = false;
    patEditErVisitId = null;
}

function _peditFloat(id) { const v = document.getElementById(id).value.trim(); return v === '' ? null : parseFloat(v); }

async function saveEditPatient() {
    const patientId = parseInt(document.getElementById('pedit-patient-id').value);
    const temp      = _peditFloat('pedit-temperature');
    const hr        = _peditFloat('pedit-heartrate');
    const rr        = _peditFloat('pedit-resprate');
    const o2        = _peditFloat('pedit-o2sat');
    const sbp       = _peditFloat('pedit-sbp');
    const dbp       = _peditFloat('pedit-dbp');
    const acuity    = _peditFloat('pedit-acuity');
    const arrival   = document.getElementById('pedit-arrival-time').value.trim()        || null;
    const departure = document.getElementById('pedit-departure-time').value.trim()      || null;
    const bedOcc    = document.getElementById('pedit-bed-occupation-time').value.trim() || null;
    const ageRaw    = document.getElementById('pedit-age').value.trim();
    const age       = ageRaw === '' ? null : parseInt(ageRaw);
    const name      = document.getElementById('pedit-name').value.trim();
    const gender    = document.getElementById('pedit-gender').value;
    const pain      = document.getElementById('pedit-pain').value.trim();
    const chiefcomplaint = document.getElementById('pedit-chiefcomplaint').value.trim();
    const triageTime = document.getElementById('pedit-triage-time').value.trim() || null;

    setPatEditError('');
    if (isNaN(patientId) || patientId < 1) { setPatEditError('Patient ID must be a positive integer.'); return; }
    if (!name)                 { setPatEditError('Name is required.'); return; }
    if (!arrival)               { setPatEditError('Arrival time is required.'); return; }
    // gender/age/acuity/chiefcomplaint stay required for every stay EXCEPT
    // one still being filled in after a live-roster pick (record_source=
    // "external" + er_visit_id) — mirrors the server's own
    // check_required_by_origin in patient_management/api.py exactly, so a
    // roster-origin stay can be saved incrementally instead of all at once.
    if (!patEditIsRosterOrigin) {
        if (!gender)                { setPatEditError('Gender is required.'); return; }
        if (age    === null || age    < 0)                      { setPatEditError('Age is required and must be a positive number.'); return; }
        if (acuity === null || acuity < 1   || acuity > 5)   { setPatEditError('Acuity is required and must be between 1 and 5.'); return; }
        if (!chiefcomplaint)        { setPatEditError('Chief complaint is required.'); return; }
    }

    // Initial Vital Signs and the 4 ISBAR sections are fully optional —
    // only range-validate whichever vitals were actually entered.
    const vitalsErr = validateVitalsGroup({ temperature: temp, heartrate: hr, resprate: rr, o2sat: o2, sbp, dbp, pain });
    if (vitalsErr) { setPatEditError(vitalsErr.msg); return; }

    // Log patients API expects subject_id; daily patients API expects patient_id
    const idField = patEditSource === 'log' ? 'subject_id' : 'patient_id';
    const payload = {
        [idField]:           patientId,
        name,
        gender,
        age,
        arrival_time:        arrival,
        departure_time:      departure,
        bed_occupation_time: bedOcc,
        triage_time:         triageTime,
        temperature:         temp,
        heartrate:           hr,
        resprate:            rr,
        o2sat:               o2,
        sbp,
        dbp,
        pain,
        acuity,
        chiefcomplaint
    };
    if (patEditSource === 'log') {
        payload.destination = composeDestination('pedit-destination', 'pedit-destination-detail');
    } else {
        const isbarPayload = buildIsbarPayload('edit', collectVitalsAdditions('edit'));
        if (isbarPayload) payload.isbar = isbarPayload;
        // Same fix as saveActivePatientForm() (Page A): check_required_by_origin
        // re-derives roster-origin from this request's own fields, so they must
        // be resent on every save, not just at creation.
        if (patEditIsRosterOrigin) {
            payload.record_source = 'external';
            payload.er_visit_id   = patEditErVisitId;
        }
    }

    const btn = document.getElementById('save-patient-edit-btn');
    btn.disabled = true; btn.textContent = 'Saving…';

    const url = patEditSource === 'log'
        ? '/api/data/log-patients/modify/' + patEditStayId
        : '/api/patients/modify/' + patEditStayId;

    try {
        const response = await fetch(url, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) {
            setPatEditError(response.status < 500 ? (parseApiError(result.detail) || 'Error ' + response.status) : 'Save failed. Please try again.');
            return;
        }
        const savedStayId = patEditStayId;
        closeEditPatientModal();
        showMessage(result.message, 'success');
        if (patEditSource === 'log') {
            notifyDataChange('log-patient', `Log stay #${savedStayId} updated`);
            if (typeof loadLogPatientsSettings === 'function') loadLogPatientsSettings();
            if (patActiveView === 'log') loadPatientLog();
        } else {
            notifyDataChange('patient', `Patient #${patientId} (Stay #${savedStayId}) updated`);
            loadPatients();
        }
    } catch (error) {
        setPatEditError('Network error: ' + error.message);
    } finally {
        btn.disabled = false; btn.textContent = 'Save';
    }
}

// ── Delete Modal ──────────────────────────────────────────────────────────────

function confirmDeletePatient(stayId, source) {
    patDeleteStayId  = stayId;
    patDeleteSource  = source || 'daily';
    const prefix = patDeleteSource === 'log' ? 'log stay ' : 'Stay ID ';
    document.getElementById('pat-delete-label').textContent = prefix + stayId;
    document.getElementById('patient-delete-modal').style.display = 'block';
}

function closeDeletePatientModal() {
    document.getElementById('patient-delete-modal').style.display = 'none';
    patDeleteStayId = null;
}

async function deletePatient() {
    if (!patDeleteStayId) return;
    const btn = document.getElementById('pat-delete-confirm-btn');
    btn.disabled = true; btn.textContent = 'Deleting…';

    const url = patDeleteSource === 'log'
        ? '/api/data/log-patients/delete/' + patDeleteStayId
        : '/api/patients/delete/' + patDeleteStayId;

    try {
        const response = await fetch(url, { method: 'DELETE' });
        const result   = await response.json();
        if (!response.ok) throw new Error(
            response.status < 500 ? (result.detail || 'HTTP ' + response.status) : 'Delete failed. Please try again.'
        );
        const deletedId = patDeleteStayId;
        closeDeletePatientModal();
        showMessage(result.message, 'success');
        if (patDeleteSource === 'log') {
            notifyDataChange('log-patient', `Log stay #${deletedId} deleted`);
            if (typeof loadLogPatientsSettings === 'function') loadLogPatientsSettings();
            if (patActiveView === 'log') loadPatientLog();
        } else {
            notifyDataChange('patient', `Stay #${deletedId} removed from daily patients`);
            loadPatients();
        }
    } catch (error) {
        showMessage('Error: ' + error.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = 'Delete';
    }
}

// Refresh patient view whenever any data changes and this section is open
onDataChange(function() {
    if (document.getElementById('patients')?.classList.contains('active')) {
        if (patActiveView === 'log') loadPatientLog();
        else loadPatients();
    }
});
