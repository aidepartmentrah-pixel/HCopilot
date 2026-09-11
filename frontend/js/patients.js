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
let patDeleteStayId  = null;
let patDeleteSource  = 'daily'; // 'daily' | 'log' — controls which API endpoint deletePatient calls
let patActiveView    = 'daily'; // 'daily' | 'log'

window.addEventListener('click', function(e) {
    if (e.target === document.getElementById('patient-edit-modal'))   closeEditPatientModal();
    if (e.target === document.getElementById('patient-delete-modal')) closeDeletePatientModal();
});

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

function patAutoOccupation() {
    const arr = document.getElementById('pat-arrival-time').value;
    const occ = document.getElementById('pat-bed-occupation-time');
    if (arr && !occ.value) occ.value = arr;
}

function peditAutoOccupation() {
    const arr = document.getElementById('pedit-arrival-time').value;
    const occ = document.getElementById('pedit-bed-occupation-time');
    if (arr && !occ.value) occ.value = arr;
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
function collectVitalsAdditions(mode) {
    const prefix = _isbarPrefix(mode);
    const val = id => { const el = document.getElementById(prefix + '-' + id); return el ? el.value.trim() : ''; };
    const out = {};
    if (val('blood-glucose') !== '') out.blood_glucose = parseFloat(val('blood-glucose'));
    if (val('o2-support') !== '') out.o2_support = val('o2-support');
    if (val('o2-flow-rate') !== '') out.o2_flow_rate = parseFloat(val('o2-flow-rate'));
    if (val('vitals-measured-at') !== '') out.vitals_measured_at = val('vitals-measured-at');
    if (val('vitals-recorded-by') !== '') out.vitals_recorded_by = val('vitals-recorded-by');
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

function initPatientForm() {
    loadNextPatientIds();
    document.getElementById('pat-arrival-time').value = _currentDatetimeLocal();

    // Mount the ISBAR accordion + default the "auto" vitals fields exactly
    // once — initPatientForm() re-runs on every loadPatients() (including
    // from unrelated onDataChange events elsewhere in the app), so this must
    // not repeat or it would silently wipe an in-progress ISBAR entry.
    const mount = document.getElementById('isbar-accordion-add');
    if (mount && !mount.dataset.mounted) {
        mountIsbarAccordion('add');
        mount.dataset.mounted = '1';
        document.getElementById('pat-vitals-measured-at').value = _currentDatetimeLocal();
        const u = typeof currentUser === 'function' ? currentUser() : null;
        document.getElementById('pat-vitals-recorded-by').value = u ? (u.name || u.username || '') : '';
        refreshPatientCoreSectionStatus();
    }
}

// ── Outer add-card collapse ("+ Add New Patient Stay" → data-entry mode) ────
// Collapsed by default; expanding is the explicit "start entering a new
// stay" action. Collapses again after a successful submit so attention
// returns to the dataset table, per the Wave-2 design feedback.

function toggleAddCardCollapse(forceExpanded) {
    const card = document.getElementById('pat-add-card');
    const body = document.getElementById('pat-add-body');
    const top = document.getElementById('pat-add-top');
    const title = document.getElementById('pat-add-top-title');
    const icon = document.getElementById('pat-add-top-icon');
    const statusEl = document.getElementById('pat-add-top-status');
    const expanded = forceExpanded !== undefined ? forceExpanded : card.dataset.expanded !== 'true';

    card.dataset.expanded = expanded ? 'true' : 'false';
    body.hidden = !expanded;
    top.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    icon.textContent = expanded ? '📋' : '➕';
    title.textContent = expanded ? 'New Patient Entry' : 'Add New Patient Stay';
    statusEl.hidden = !expanded;
    if (expanded) {
        statusEl.textContent = 'In progress';
        // Only Patient & Arrival opens by default when entering data-entry mode
        document.getElementById('isbar-details-patient-arrival-add').open = true;
    }
}

function cancelAddPatientForm() {
    if (isbarAddDirty || _patVal('pat-name') || _patVal('pat-chiefcomplaint')) {
        if (!confirm('Discard this in-progress patient entry?')) return;
    }
    clearPatientForm();
    toggleAddCardCollapse(false);
}

// Opens a section by id (any mode) and scrolls it into view — used by the
// "Continue to Vital Signs →" affordance and by validation-failure handling.
function openIsbarSection(mode, sectionId) {
    const details = document.getElementById(`isbar-details-${sectionId}-${mode}`);
    if (!details) return;
    details.open = true;
    details.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── Patient & Arrival / Initial Vital Signs status (real required fields) ───

function refreshPatientCoreSectionStatus() {
    const requiredArrival = ['pat-name', 'pat-gender', 'pat-age', 'pat-arrival-time', 'pat-chiefcomplaint', 'pat-acuity'];
    updateIsbarCoreSectionStatus('add', 'patient-arrival', requiredArrival,
        id => document.getElementById(id).value, false,
        _patVal('pat-chiefcomplaint') || null);

    const requiredVitals = ['pat-temperature', 'pat-heartrate', 'pat-resprate', 'pat-o2sat', 'pat-sbp', 'pat-dbp', 'pat-pain'];
    const o2Support = _patVal('pat-o2-support');
    const missingFlow = O2_SUPPORT_NEEDS_FLOW.includes(o2Support) && !_patVal('pat-o2-flow-rate');
    updateIsbarCoreSectionStatus('add', 'vitals', requiredVitals,
        id => document.getElementById(id).value, missingFlow, null);

    updatePatAddRequiredRemaining();
}

function updatePatAddRequiredRemaining() {
    const el = document.getElementById('pat-add-required-remaining');
    if (!el) return;
    const requiredIds = ['pat-name', 'pat-gender', 'pat-age', 'pat-arrival-time', 'pat-chiefcomplaint', 'pat-acuity',
        'pat-temperature', 'pat-heartrate', 'pat-resprate', 'pat-o2sat', 'pat-sbp', 'pat-dbp', 'pat-pain'];
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
        initPatientForm();
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
        document.getElementById('pat-dataset-card-title').textContent    = '📋 Patient Dataset';
        document.getElementById('pat-dataset-card-subtitle').textContent = 'All patient stays in the system';
        renderPatientsTable(allPatientsData);
        document.getElementById('pat-stats-bar').style.display  = allPatientsData.length ? 'flex' : 'none';
        document.getElementById('pat-filter-bar').style.display = allPatientsData.length ? 'flex' : 'none';
    } else {
        document.getElementById('pat-dataset-card-title').textContent    = '📁 Patient Log';
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

        allPatLogData = listData.patients;

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

function renderLogPatientsTable(patients) {
    const container = document.getElementById('patients-table-container');
    const countEl   = document.getElementById('pat-visible-count');
    if (countEl) countEl.textContent = patients.length + ' record' + (patients.length !== 1 ? 's' : '');

    if (patients.length === 0) {
        container.innerHTML = '<div class="s-no-results"><div class="s-no-results-icon">🔍</div><p>No records match your filters.</p></div>';
        return;
    }

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

    const rows = patients.map(p =>
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
        '<div class="s-table-footer">' + patients.length + ' records shown' +
        (patients.length < allPatLogData.length ? ' <span class="s-filter-hint">(filtered from ' + allPatLogData.length + ' total)</span>' : '') +
        '</div>';
}

function filterPatients() {
    const search = document.getElementById('pat-search').value.toLowerCase().trim();
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

    const rows = patients.map(p =>
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
        '<div class="s-table-footer">' + patients.length + ' records shown' +
        (patients.length < allPatientsData.length
            ? ' <span class="s-filter-hint">(filtered from ' + allPatientsData.length + ' total)</span>'
            : '') +
        '</div>';
}

document.addEventListener('click', function(e) {
    const editBtn       = e.target.closest('[data-action="edit-patient"]');
    const editLogBtn    = e.target.closest('[data-action="edit-log-patient"]');
    const delBtn        = e.target.closest('[data-action="delete-patient"]');
    const delLogBtn     = e.target.closest('[data-action="delete-log-patient"]');
    const viewBtn       = e.target.closest('[data-action="view-patient-details"]');
    const viewLogBtn    = e.target.closest('[data-action="view-log-patient-details"]');
    if (editBtn)    openEditPatientModal(JSON.parse(editBtn.dataset.row),    'daily');
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

function clearPatientForm() {
    ['pat-name','pat-gender','pat-age',
     'pat-departure-time','pat-bed-occupation-time',
     'pat-temperature','pat-heartrate','pat-resprate',
     'pat-o2sat','pat-sbp','pat-dbp','pat-pain','pat-acuity','pat-chiefcomplaint']
        .forEach(id => { document.getElementById(id).value = ''; });
    resetVitalsAdditions('add');
    resetIsbarState('add');
    document.getElementById('pat-vitals-measured-at').value = _currentDatetimeLocal();
    const u = typeof currentUser === 'function' ? currentUser() : null;
    document.getElementById('pat-vitals-recorded-by').value = u ? (u.name || u.username || '') : '';
    setPatAddError('');
    setPatAddErrorSummary('');
    initPatientForm();
    refreshPatientCoreSectionStatus();
}

async function submitPatientForm() {
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
    const departure = _patVal('pat-departure-time') || null;
    const bedOcc    = _patVal('pat-bed-occupation-time') || null;
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
    if (temp   === null || temp   < 26  || temp   > 46)  { failPatAddValidation('Temperature is required and must be between 26 and 46 °C.', 'pat-temperature'); return; }
    if (hr     === null || hr     < 20  || hr     > 300) { failPatAddValidation('Heart rate is required and must be between 20 and 300 bpm.', 'pat-heartrate'); return; }
    if (rr     === null || rr     < 4   || rr     > 100) { failPatAddValidation('Resp. rate is required and must be between 4 and 100.', 'pat-resprate'); return; }
    if (o2     === null || o2     < 0   || o2     > 100) { failPatAddValidation('O₂ saturation is required and must be between 0 and 100 %.', 'pat-o2sat'); return; }
    if (sbp    === null || sbp    < 40  || sbp    > 300) { failPatAddValidation('SBP is required and must be between 40 and 300 mmHg.', 'pat-sbp'); return; }
    if (dbp    === null || dbp    < 20  || dbp    > 200) { failPatAddValidation('DBP is required and must be between 20 and 200 mmHg.', 'pat-dbp'); return; }
    if (!pain)                 { failPatAddValidation('Pain is required.', 'pat-pain'); return; }
    if (acuity === null || acuity < 1   || acuity > 5)   { failPatAddValidation('Acuity is required and must be between 1 and 5.', 'pat-acuity'); return; }
    if (!chiefcomplaint)       { failPatAddValidation('Chief complaint is required.', 'pat-chiefcomplaint'); return; }

    const payload = {
        patient_id:          patientId,
        stay_id:             stayId,
        name,
        gender,
        age,
        arrival_time:        arrival,
        departure_time:      departure,
        bed_occupation_time: bedOcc,
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
        clearPatientForm();
        setPatAddErrorSummary('');
        toggleAddCardCollapse(false);
        showMessage(result.message, 'success');
        notifyDataChange('patient', `Patient #${patientId} added to daily patients`);
        loadPatients();
        document.querySelector('.pat-dataset-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
        setPatAddError('Network error: ' + error.message);
    } finally {
        btn.disabled = false; btn.textContent = '➕ Add Patient';
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
    const prefix   = patEditSource === 'log' ? '📁 Edit Log Stay #' : 'Edit Stay #';
    document.getElementById('patient-edit-title').textContent = prefix + row.stay_id;
    // Log patients use subject_id; daily patients use patient_id — normalise here
    document.getElementById('pedit-patient-id').value          = row.patient_id ?? row.subject_id;
    document.getElementById('pedit-stay-id').value             = row.stay_id;
    document.getElementById('pedit-name').value                = row.name           != null ? row.name           : '';
    document.getElementById('pedit-gender').value              = row.gender         != null ? row.gender         : '';
    document.getElementById('pedit-age').value                 = row.age            != null ? row.age            : '';
    document.getElementById('pedit-arrival-time').value        = row.arrival_time   ? String(row.arrival_time).slice(0, 16)   : _currentDatetimeLocal();
    document.getElementById('pedit-departure-time').value      = row.departure_time ? String(row.departure_time).slice(0, 16) : '';
    document.getElementById('pedit-bed-occupation-time').value = _toDatetimeLocal(row.bed_occupation_time);
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
                    if (v.vitals_measured_at) document.getElementById('pedit-vitals-measured-at').value = String(v.vitals_measured_at).slice(0, 16);
                    if (v.vitals_recorded_by) document.getElementById('pedit-vitals-recorded-by').value = v.vitals_recorded_by;
                }
            })
            .catch(() => {});
    }

    document.getElementById('patient-edit-modal').style.display = 'block';
}

function closeEditPatientModal() {
    document.getElementById('patient-edit-modal').style.display = 'none';
    patEditStayId = null;
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

    setPatEditError('');
    if (isNaN(patientId) || patientId < 1) { setPatEditError('Patient ID must be a positive integer.'); return; }
    if (!name)                 { setPatEditError('Name is required.'); return; }
    if (!gender)                { setPatEditError('Gender is required.'); return; }
    if (age    === null || age    < 0)                      { setPatEditError('Age is required and must be a positive number.'); return; }
    if (!arrival)               { setPatEditError('Arrival time is required.'); return; }
    if (temp   === null || temp   < 26  || temp   > 46)  { setPatEditError('Temperature is required and must be between 26 and 46 °C.'); return; }
    if (hr     === null || hr     < 20  || hr     > 300) { setPatEditError('Heart rate is required and must be between 20 and 300 bpm.'); return; }
    if (rr     === null || rr     < 4   || rr     > 100) { setPatEditError('Resp. rate is required and must be between 4 and 100.'); return; }
    if (o2     === null || o2     < 0   || o2     > 100) { setPatEditError('O₂ sat is required and must be between 0 and 100 %.'); return; }
    if (sbp    === null || sbp    < 40  || sbp    > 300) { setPatEditError('SBP is required and must be between 40 and 300 mmHg.'); return; }
    if (dbp    === null || dbp    < 20  || dbp    > 200) { setPatEditError('DBP is required and must be between 20 and 200 mmHg.'); return; }
    if (!pain)                  { setPatEditError('Pain is required.'); return; }
    if (acuity === null || acuity < 1   || acuity > 5)   { setPatEditError('Acuity is required and must be between 1 and 5.'); return; }
    if (!chiefcomplaint)        { setPatEditError('Chief complaint is required.'); return; }

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
