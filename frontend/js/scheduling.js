/**
 * scheduling.js — Scheduling section for HCopilot.
 *
 * Manual assignment interface: the user selects one patient, one bed, one
 * doctor, and up to two nurses from four searchable panels, then confirms
 * to create the assignment via the API.
 *
 * Responsibilities:
 *   loadScheduling()       — fetch all four entity lists and current assignments
 *                            in parallel; render the selection panels and table.
 *   selectItem()           — mark an item as selected in a panel and update the
 *                            summary bar shown above the confirm button.
 *   confirmAssignment()    — POST /api/scheduling/assign with the current selections.
 *   editAssignment()       — open an edit modal pre-filled with the existing links.
 *   confirmEditAssignment()— PUT /api/scheduling/edit/{patientId}.
 *   deleteAssignment()     — DELETE /api/scheduling/delete/{patientId}.
 *   dischargeFromSched()   — POST /api/scheduling/discharge/{stayId}.
 *
 * Global state:
 *   schedPatients / schedDoctors / schedNurses / schedBeds — raw entity pools
 *   selectedPatient / selectedBed / selectedDoctor / selectedNurses — current picks
 */

const SCHED_BASE         = '/api/scheduling';
const SCHED_PATIENTS_URL = '/api/patients/list';
const SCHED_DOCTORS_URL  = '/api/staff/doctors/list';
const SCHED_NURSES_URL   = '/api/staff/nurses/list';
const SCHED_BEDS_URL     = '/api/beds/list';

// Raw data pools fetched from the API — rendered into lists and re-filtered on search
let schedPatients         = [];
let schedDoctors          = [];   // full unfiltered list
let schedNurses           = [];   // full unfiltered list
let schedDoctorsFiltered  = [];   // after shift/group/absent filter
let schedNursesFiltered   = [];   // after shift/group/absent filter
let schedBeds             = [];
let schedAssignments      = [];
let _schedShifts          = [];
let _schedGroups          = [];

// Currently selected items — one per panel (nurses have two slots)
let selPatient   = null;
let selDoctor    = null;
let selNurse1    = null;
let selNurse2    = null;
let selBed       = null;
let selUnurgent  = false;   // true when routing to Unurgent Care instead of a bed

let schedUnurgentIds = new Set();  // patient_ids already in unurgent care (excluded from list)

// ── Entry point ────────────────────────────────────────────────────────────────

async function loadSchedulingSection() {
    _setRefreshLoading(true);
    ['sch-patient-list','sch-doctor-list','sch-nurse-list','sch-bed-list','sch-assignments-table'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    });
    const arrivalEl = document.getElementById('sch-arrival-time');
    if (arrivalEl) arrivalEl.value = nowLocalIso();
    await Promise.all([
        _loadSchedPatients(),
        _loadSchedDoctors(),
        _loadSchedNurses(),
        _loadSchedBeds(),
        loadSchedAssignments(),
        _loadSchedShiftsGroups(),
        _loadSchedUnurgentIds(),
    ]);
    _renderPatientList(document.getElementById('sch-patient-search')?.value || '');
    renderSchedSummary();
    _setRefreshLoading(false);
}

function _setRefreshLoading(on) {
    // Toggle the "Refresh" button's loading state
    const btn = document.getElementById('sch-refresh-btn');
    if (!btn) return;
    btn.disabled = on;
    btn.classList.toggle('loading', on);
    const label = btn.querySelector('.sch-refresh-label');
    if (label) label.textContent = on ? 'Refreshing…' : 'Refresh';
}

// ── Data loaders ───────────────────────────────────────────────────────────────

async function _loadSchedPatients() {
    // Fetch all daily patients; rendering is deferred until assignments are also loaded
    // so the "already assigned" filter has the full assignments list to work from
    try {
        const res  = await fetch(SCHED_PATIENTS_URL);
        const data = await res.json();
        schedPatients = data.patients || [];
        _renderPatientList('');
    } catch (e) {
        const el = document.getElementById('sch-patient-list');
        if (el) el.innerHTML = '<div class="sch-panel-empty">Failed to load patients</div>';
    }
}

async function _loadSchedDoctors() {
    try {
        const res  = await fetch(SCHED_DOCTORS_URL);
        const data = await res.json();
        schedDoctors = data.doctors || [];
        schedDoctorsFiltered = [...schedDoctors];
        applySchedStaffFilter();
    } catch (e) {
        const el = document.getElementById('sch-doctor-list');
        if (el) el.innerHTML = '<div class="sch-panel-empty">Failed to load doctors</div>';
    }
}

async function _loadSchedNurses() {
    try {
        const res  = await fetch(SCHED_NURSES_URL);
        const data = await res.json();
        schedNurses = data.nurses || [];
        schedNursesFiltered = [...schedNurses];
        applySchedStaffFilter();
    } catch (e) {
        const el = document.getElementById('sch-nurse-list');
        if (el) el.innerHTML = '<div class="sch-panel-empty">Failed to load nurses</div>';
    }
}

async function _loadSchedShiftsGroups() {
    try {
        const [sRes, gRes] = await Promise.all([
            fetch('/api/staff/shifts/list'),
            fetch('/api/staff/groups/list')
        ]);
        _schedShifts = (await sRes.json()).shifts || [];
        _schedGroups = (await gRes.json()).groups || [];
    } catch (_) {
        _schedShifts = []; _schedGroups = [];
    }

    const _icon = n => {
        const l = (n || '').toLowerCase();
        return l.includes('morning') ? '☀️' : l.includes('evening') ? '🌇' : l.includes('night') ? '🌙' : l.includes('day') ? '🌤️' : '🕐';
    };

    const shiftSel = document.getElementById('sch-sf-shift');
    const groupSel = document.getElementById('sch-sf-group');
    if (shiftSel) {
        const prev = shiftSel.value;
        shiftSel.innerHTML = '<option value="">All Shifts</option>';
        _schedShifts.forEach(s => { shiftSel.innerHTML += `<option value="${s.name}">${_icon(s.name)} ${s.name}</option>`; });
        shiftSel.value = prev;
    }
    if (groupSel) {
        const prev = groupSel.value;
        groupSel.innerHTML = '<option value="">All Groups</option>';
        _schedGroups.forEach(g => { groupSel.innerHTML += `<option value="${g.name}">${g.name}</option>`; });
        groupSel.value = prev;
    }

    applySchedStaffFilter();
}

function applySchedStaffFilter() {
    const shiftFilter = document.getElementById('sch-sf-shift')?.value  || '';
    const groupFilter = document.getElementById('sch-sf-group')?.value  || '';
    const hideAbsent  = document.getElementById('sch-sf-hide-absent')?.checked ?? true;

    schedDoctorsFiltered = schedDoctors.filter(d =>
        (!shiftFilter || d.shift === shiftFilter)
        && (!groupFilter || d.work_days === groupFilter)
        && !(hideAbsent && d.absent)
    );
    schedNursesFiltered = schedNurses.filter(n =>
        (!shiftFilter || n.shift === shiftFilter)
        && (!groupFilter || n.group === groupFilter)
        && !(hideAbsent && n.absent)
    );

    const hint = document.getElementById('sch-sf-hint');
    if (hint) {
        const dTotal = schedDoctors.length, dShown = schedDoctorsFiltered.length;
        const nTotal = schedNurses.length,  nShown = schedNursesFiltered.length;
        hint.textContent = (dShown < dTotal || nShown < nTotal)
            ? `Showing ${dShown}/${dTotal} doctors, ${nShown}/${nTotal} nurses — also applied to OR tool`
            : '';
    }

    _renderDoctorList(document.getElementById('sch-doctor-search')?.value || '');
    _renderNurseList(document.getElementById('sch-nurse-search')?.value || '');

    // Keep the simulation section's OR selects in sync so the user sees the
    // same active shift/group there. The OR tool reads these when it next runs.
    _syncSimShiftGroupSelects(shiftFilter, groupFilter);
}

function _syncSimShiftGroupSelects(shiftVal, groupVal) {
    // Only sync the simulation selects if the simulation section has been
    // initialised (i.e. the selects exist and have options loaded).
    const simShiftSel = document.getElementById('sim-shift-select');
    const simGroupSel = document.getElementById('sim-group-select');
    if (simShiftSel && simShiftSel.options.length > 1) {
        simShiftSel.value = shiftVal;   // '' resets to "Auto-detect"
    }
    if (simGroupSel && simGroupSel.options.length > 1) {
        simGroupSel.value = groupVal;
    }
}

async function _loadSchedUnurgentIds() {
    try {
        const res  = await fetch('/api/unurgent/list');
        const data = await res.json();
        schedUnurgentIds = new Set((data.patients || []).map(p => p.subject_id));
    } catch (_) {
        schedUnurgentIds = new Set();
    }
}

async function _loadSchedBeds() {
    try {
        const res  = await fetch(SCHED_BEDS_URL);
        const data = await res.json();
        schedBeds = data.beds || [];
        _renderBedList('', '');
    } catch (e) {
        const el = document.getElementById('sch-bed-list');
        if (el) el.innerHTML = '<div class="sch-panel-empty">Failed to load beds</div>';
    }
}

async function loadSchedAssignments() {
    // Fetch current assignments and render the assignments table
    const el = document.getElementById('sch-assignments-table');
    try {
        const res  = await fetch(SCHED_BASE + '/list');
        const data = await res.json();
        schedAssignments = data.assignments || [];
        _renderAssignmentsTable();
    } catch (e) {
        if (el) el.innerHTML = '<div class="sch-empty"><span class="sch-empty-icon">⚠️</span>Failed to load assignments</div>';
    }
}

// ── List renderers ─────────────────────────────────────────────────────────────

function _renderPatientList(search) {
    const el = document.getElementById('sch-patient-list');
    if (!el) return;
    const q = search.toLowerCase();
    // Exclude patients who already have a bed assigned — they are not available for scheduling
    const assignedIds = new Set(schedAssignments.map(a => a.patient_id));
    const items = schedPatients.filter(p =>
        !assignedIds.has(p.patient_id) &&
        !schedUnurgentIds.has(p.patient_id) &&
        (!q ||
        String(p.patient_id).includes(q) ||
        String(p.stay_id).includes(q) ||
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.chiefcomplaint && p.chiefcomplaint.toLowerCase().includes(q)))
    );
    if (!items.length) {
        el.innerHTML = '<div class="sch-panel-empty">No patients found</div>';
        return;
    }
    el.innerHTML = items.map(p => {
        const sel = selPatient && selPatient.stay_id == p.stay_id;
        const namePart = p.name ? `<div class="sch-item-name">${p.name}${p.age != null ? ', ' + p.age + ' y/o' : ''}${p.gender ? ' · ' + p.gender : ''}</div>` : '';
        return `<div class="sch-item${sel ? ' sch-sel-patient' : ''}" onclick="selectSchedPatient(${p.stay_id})">
            <div class="sch-item-id">Stay #${p.stay_id}</div>
            <div class="sch-item-meta">Patient: ${p.patient_id}</div>
            ${namePart}
            ${p.chiefcomplaint ? `<div class="sch-item-complaint">${p.chiefcomplaint}</div>` : ''}
            ${sel ? '<div class="sch-item-check">✓ Selected</div>' : ''}
        </div>`;
    }).join('');
}

function _shiftDisplay(shiftName) {
    const l = (shiftName || '').toLowerCase();
    const icon = l.includes('morning') ? '☀️' : l.includes('evening') ? '🌇' : l.includes('night') ? '🌙' : l.includes('day') ? '🌤️' : '🕐';
    const label = shiftName ? (shiftName.charAt(0).toUpperCase() + shiftName.slice(1)) : '—';
    return `${icon} ${label}`;
}

function _renderDoctorList(search) {
    const el = document.getElementById('sch-doctor-list');
    if (!el) return;
    const q = search.toLowerCase();
    const items = schedDoctorsFiltered.filter(d =>
            !q ||
            String(d.id).includes(q) ||
            (d.name && d.name.toLowerCase().includes(q)) ||
            (d.intern_or_not && d.intern_or_not.toLowerCase().includes(q)) ||
            (d.shift && d.shift.toLowerCase().includes(q))
        );
    if (!items.length) {
        el.innerHTML = '<div class="sch-panel-empty">No doctors match the current filter</div>';
        return;
    }
    el.innerHTML = items.map(d => {
        const sel  = selDoctor && selDoctor.id == d.id;
        const type = d.intern_or_not === 'doctor' ? '🩺 Doctor' : '🎓 Intern';
        return `<div class="sch-item${sel ? ' sch-sel-doctor' : ''}" onclick="selectSchedDoctor(${d.id})">
            <div class="sch-item-id">#${d.id} · ${type}</div>
            ${d.name ? `<div class="sch-item-name">${d.name}</div>` : ''}
            <div class="sch-item-meta">${_shiftDisplay(d.shift)} · Group ${d.work_days}</div>
            ${d.ward ? `<div class="sch-item-meta">Ward ${d.ward}</div>` : ''}
            ${sel ? '<div class="sch-item-check">✓ Selected</div>' : ''}
        </div>`;
    }).join('');
}

function _renderNurseList(search) {
    const listEl = document.getElementById('sch-nurse-list');
    const barEl  = document.getElementById('sch-nurse-slots-bar');
    if (!listEl) return;

    // Update the slot indicator showing which nurses are currently in slots 1 and 2
    if (barEl) {
        const n1 = selNurse1 ? `<strong style="color:#6d28d9">#${selNurse1.id}</strong>` : '<span style="color:#9ca3af">—</span>';
        const n2 = selNurse2 ? `<strong style="color:#9333ea">#${selNurse2.id}</strong>` : '<span style="color:#9ca3af">—</span>';
        barEl.innerHTML = `Slot 1: ${n1} &nbsp;·&nbsp; Slot 2: ${n2}`;
    }

    const q = search.toLowerCase();
    const items = schedNursesFiltered.filter(n =>
            !q ||
            String(n.id).includes(q) ||
            (n.name && n.name.toLowerCase().includes(q)) ||
            (n.role && n.role.toLowerCase().includes(q)) ||
            (n.shift && n.shift.toLowerCase().includes(q))
        );
    if (!items.length) {
        listEl.innerHTML = '<div class="sch-panel-empty">No nurses match the current filter</div>';
        return;
    }
    listEl.innerHTML = items.map(n => {
        const isN1  = selNurse1 && selNurse1.id == n.id;
        const isN2  = selNurse2 && selNurse2.id == n.id;
        const cls   = isN1 ? ' sch-sel-nurse1' : isN2 ? ' sch-sel-nurse2' : '';
        const check = isN1 ? '✓ Nurse 1' : isN2 ? '✓ Nurse 2' : '';
        return `<div class="sch-item${cls}" onclick="selectSchedNurse(${n.id})">
            <div class="sch-item-id">#${n.id} · ${n.role}</div>
            ${n.name ? `<div class="sch-item-name">${n.name}</div>` : ''}
            <div class="sch-item-meta">${_shiftDisplay(n.shift)} · Group ${n.group}</div>
            ${n.ward ? `<div class="sch-item-meta">Ward ${n.ward}</div>` : ''}
            ${check ? `<div class="sch-item-check">${check}</div>` : ''}
        </div>`;
    }).join('');
}

function _renderBedList(search, statusFilter) {
    const el = document.getElementById('sch-bed-list');
    if (!el) return;
    const q  = search.toLowerCase();
    const sf = statusFilter || (document.getElementById('sch-bed-status-filter')?.value || '');
    // Only show beds that are not occupied — occupied beds cannot be assigned
    const items = schedBeds.filter(b =>
        b.bed_status !== 'Occupied' &&
        (!q || String(b.bed_id).includes(q) || b.bed_number.toLowerCase().includes(q)) &&
        (!sf || b.bed_status === sf)
    );
    if (!items.length) {
        el.innerHTML = '<div class="sch-panel-empty">No beds found</div>';
        return;
    }
    el.innerHTML = items.map(b => {
        const sel       = selBed && selBed.bed_id == b.bed_id;
        const available = b.bed_status === 'Available';
        const dot = b.bed_status === 'Available'   ? '🟢'
                  : b.bed_status === 'Under Repair' ? '🟡'
                  : '🔴';
        // Dim and disable beds that are under repair so only "Available" beds can be clicked
        const disabledStyle = available ? '' : 'opacity:0.45;cursor:not-allowed;';
        const onclick = available ? `onclick="selectSchedBed(${b.bed_id})"` : '';
        const btype = b.bed_type || 'normal';
        return `<div class="sch-item${sel ? ' sch-sel-bed' : ''}" ${onclick} style="${disabledStyle}">
            <div class="sch-item-id">🛏️ ${b.bed_number}</div>
            <div class="sch-item-meta">${dot} ${b.bed_status}</div>
            <div class="bed-type-badge type-${btype.toLowerCase()}">${btype}</div>
            ${b.ward_id != null ? `<div class="sch-item-meta">${b.ward_name || ('Ward ' + b.ward_id)}</div>` : ''}
            ${!available ? `<div class="sch-item-meta" style="font-size:10px;color:#9ca3af">Not available for scheduling</div>` : ''}
            ${sel ? '<div class="sch-item-check">✓ Selected</div>' : ''}
        </div>`;
    }).join('');
}

// ── Selection handlers ─────────────────────────────────────────────────────────

function selectSchedPatient(stay_id) {
    // Toggle patient selection: clicking a selected patient deselects it
    const p = schedPatients.find(x => x.stay_id == stay_id);
    if (!p) return;
    selPatient = (selPatient && selPatient.stay_id == stay_id) ? null : p;
    _renderPatientList(document.getElementById('sch-patient-search').value);
    renderSchedSummary();
}

function selectSchedDoctor(id) {
    const d = schedDoctors.find(x => x.id == id);
    if (!d) return;
    selDoctor = (selDoctor && selDoctor.id == id) ? null : d;
    _renderDoctorList(document.getElementById('sch-doctor-search').value);
    renderSchedSummary();
}

function selectSchedNurse(id) {
    // Nurses use a two-slot system: first click fills slot 1, second fills slot 2.
    // Clicking a selected nurse removes them and promotes slot 2 to slot 1 if needed.
    const n = schedNurses.find(x => x.id == id);
    if (!n) return;
    if (selNurse1 && selNurse1.id == id) {
        selNurse1 = selNurse2;  // promote slot 2 into slot 1
        selNurse2 = null;
    } else if (selNurse2 && selNurse2.id == id) {
        selNurse2 = null;
    } else if (!selNurse1) {
        selNurse1 = n;
    } else if (!selNurse2) {
        selNurse2 = n;
    } else {
        // Both slots occupied — replace slot 2
        selNurse2 = n;
    }
    _renderNurseList(document.getElementById('sch-nurse-search').value);
    renderSchedSummary();
}

function selectSchedBed(id) {
    const b = schedBeds.find(x => x.bed_id == id);
    if (!b || b.bed_status !== 'Available') return;
    selBed = (selBed && selBed.bed_id == id) ? null : b;
    _renderBedList(document.getElementById('sch-bed-search').value, '');
    renderSchedSummary();
}

// ── Filter handlers ────────────────────────────────────────────────────────────

function filterSchedPatients() { _renderPatientList(document.getElementById('sch-patient-search').value); }
function filterSchedDoctors()  { _renderDoctorList(document.getElementById('sch-doctor-search').value); }
function filterSchedNurses()   { _renderNurseList(document.getElementById('sch-nurse-search').value); }
function filterSchedBeds()     { _renderBedList(document.getElementById('sch-bed-search').value, ''); }

// ── Summary renderer ───────────────────────────────────────────────────────────

function renderSchedSummary() {
    // Update each slot card to show the current selection (or an empty placeholder)
    _updateSlot('sch-slot-patient', selPatient, 'patient',
        selPatient ? `Stay #${selPatient.stay_id}` : null,
        selPatient ? (selPatient.name ? selPatient.name + (selPatient.age != null ? ', ' + selPatient.age + ' y/o' : '') : `Patient ${selPatient.patient_id}`) : null,
        selPatient ? (selPatient.chiefcomplaint || (selPatient.gender || null)) : null,
        '🧑‍⚕️', 'Select a patient');

    _updateSlot('sch-slot-doctor', selDoctor, 'doctor',
        selDoctor ? `#${selDoctor.id}` : null,
        selDoctor ? (selDoctor.name || (selDoctor.intern_or_not === 'doctor' ? 'Doctor' : 'Intern')) : null,
        selDoctor ? `${selDoctor.shift} · Grp ${selDoctor.work_days}` : null,
        '👨‍⚕️', 'Select a doctor');

    _updateSlot('sch-slot-nurse1', selNurse1, 'nurse1',
        selNurse1 ? `#${selNurse1.id}` : null,
        selNurse1 ? (selNurse1.name || selNurse1.role) : null,
        selNurse1 ? `${selNurse1.role} · ${selNurse1.shift}` : null,
        '👩‍⚕️', 'Select nurse 1');

    _updateSlot('sch-slot-nurse2', selNurse2, 'nurse2',
        selNurse2 ? `#${selNurse2.id}` : null,
        selNurse2 ? (selNurse2.name || selNurse2.role) : null,
        selNurse2 ? `${selNurse2.role} · ${selNurse2.shift}` : null,
        '👩‍⚕️', 'Optional');

    // Bed / Unurgent destination slot
    const bedLabelEl = document.getElementById('sch-slot-bed-label');
    if (selUnurgent) {
        if (bedLabelEl) bedLabelEl.innerHTML = 'Destination <span style="color:#059669">*</span>';
        _updateSlot('sch-slot-bed', true, 'unurgent',
            '🏥 Unurgent Care', 'No bed assigned', 'Non-urgent treatment area',
            '🏥', '');
    } else {
        if (bedLabelEl) bedLabelEl.innerHTML = 'Bed <span style="color:#dc2626">*</span>';
        _updateSlot('sch-slot-bed', selBed, 'bed',
            selBed ? `Bed ${selBed.bed_number}` : null,
            selBed ? (selBed.bed_status === 'Available' ? '🟢 Available' : '🔴 Occupied') : null,
            selBed ? [
                selBed.ward_id != null ? (selBed.ward_name || `Ward ${selBed.ward_id}`) : null,
                `Type: ${selBed.bed_type || 'normal'}`,
            ].filter(Boolean).join(' · ') : null,
            '🛏️', 'Select a bed');
    }

    // Occupation-time row is meaningless for unurgent care
    const occRow = document.getElementById('sch-occ-time-row');
    if (occRow) occRow.style.display = selUnurgent ? 'none' : '';

    // Confirm button
    const btn = document.getElementById('sch-confirm-btn');
    if (btn) {
        if (selUnurgent) {
            btn.disabled    = !selPatient;
            btn.textContent = '🟢 Send to Unurgent Care';
        } else {
            btn.disabled    = !(selPatient && selBed);
            btn.textContent = '✓ Confirm Assignment';
        }
    }
}

function _updateSlot(slotId, sel, type, line1, line2, line3, icon, placeholder) {
    // Render a slot card as either "filled" (with details) or "empty" (with placeholder text)
    const el = document.getElementById(slotId);
    if (!el) return;
    if (sel) {
        el.className = `sch-slot-card sch-slot-filled slot-${type}`;
        el.innerHTML = `
            <div class="sch-slot-icon">${icon}</div>
            <div class="sch-slot-main">${line1 || ''}</div>
            <div class="sch-slot-sub">${line2 || ''}</div>
            ${line3 ? `<div class="sch-slot-sub">${line3}</div>` : ''}
        `;
    } else {
        el.className = `sch-slot-card slot-${type}`;
        el.innerHTML = `
            <div style="font-size:24px;color:#d1d5db">${icon}</div>
            <div class="sch-slot-placeholder">${placeholder}</div>
        `;
    }
}

// ── Unurgent Care toggle ────────────────────────────────────────────────────────

function toggleSchedUnurgent() {
    selUnurgent = !selUnurgent;
    if (selUnurgent) selBed = null;   // clear any bed selection when switching to unurgent

    const bedModeEl  = document.getElementById('sch-bed-mode-content');
    const uuModeEl   = document.getElementById('sch-unurgent-mode-content');
    const headerEl   = document.getElementById('sch-bed-panel-header');
    const iconEl     = document.getElementById('sch-bed-panel-icon');
    const titleEl    = document.getElementById('sch-bed-panel-title');
    const badgeEl    = document.getElementById('sch-bed-panel-badge');
    const toggleBtn  = document.getElementById('sch-unurgent-toggle');

    if (selUnurgent) {
        if (bedModeEl)  bedModeEl.style.display = 'none';
        if (uuModeEl)   uuModeEl.style.display  = '';
        if (headerEl)   headerEl.className       = 'sch-panel-header sch-ph-unurgent';
        if (iconEl)     iconEl.textContent        = '🏥';
        if (titleEl)    titleEl.textContent       = 'Unurgent Care';
        if (badgeEl)  { badgeEl.textContent = 'Active'; badgeEl.className = 'sch-badge sch-badge-uu'; }
        if (toggleBtn) { toggleBtn.textContent = '🛏️ Use Bed'; toggleBtn.classList.add('sch-unurgent-toggle-on'); }
    } else {
        if (bedModeEl)  bedModeEl.style.display = '';
        if (uuModeEl)   uuModeEl.style.display  = 'none';
        if (headerEl)   headerEl.className       = 'sch-panel-header sch-ph-bed';
        if (iconEl)     iconEl.textContent        = '🛏️';
        if (titleEl)    titleEl.textContent       = 'Bed';
        if (badgeEl)  { badgeEl.textContent = 'Required'; badgeEl.className = 'sch-badge sch-badge-req'; }
        if (toggleBtn) { toggleBtn.textContent = '🟢 Unurgent'; toggleBtn.classList.remove('sch-unurgent-toggle-on'); }
    }

    _renderBedList('', '');
    renderSchedSummary();
}

// ── Confirm / Clear ────────────────────────────────────────────────────────────

function clearSchedSelections() {
    // Reset all selection variables and re-render all panels to their empty state
    selPatient  = null;
    selDoctor   = null;
    selNurse1   = null;
    selNurse2   = null;
    selBed      = null;
    if (selUnurgent) toggleSchedUnurgent();   // reset unurgent mode back to bed mode
    _renderPatientList(document.getElementById('sch-patient-search').value);
    _renderDoctorList(document.getElementById('sch-doctor-search').value);
    _renderNurseList(document.getElementById('sch-nurse-search').value);
    _renderBedList(document.getElementById('sch-bed-search').value, '');
    renderSchedSummary();
    const errEl = document.getElementById('sch-assign-error');
    if (errEl) errEl.textContent = '';
    const arrivalEl = document.getElementById('sch-arrival-time');
    if (arrivalEl) arrivalEl.value = nowLocalIso();
}

async function confirmSchedAssignment() {
    const errEl = document.getElementById('sch-assign-error');
    const btn   = document.getElementById('sch-confirm-btn');

    if (!selPatient) {
        if (errEl) errEl.textContent = 'A patient is required.';
        return;
    }
    if (errEl) errEl.textContent = '';

    // ── Unurgent Care path ────────────────────────────────────────────────────
    if (selUnurgent) {
        btn.disabled    = true;
        btn.textContent = 'Sending…';
        try {
            const res  = await fetch('/api/simulation/or-confirm', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patient_id:   selPatient.patient_id,
                    stay_id:      selPatient.stay_id,
                    use_unurgent: true,
                    doctor_id:    selDoctor ? selDoctor.id   : null,
                    nurse1_id:    selNurse1 ? selNurse1.id  : null,
                    nurse2_id:    selNurse2 ? selNurse2.id  : null,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                if (errEl) errEl.textContent = parseApiError(data.detail);
            } else {
                showMessage(`Patient #${selPatient.patient_id} routed to Unurgent Care.`, 'success');
                notifyDataChange('unurgent', `Patient #${selPatient.patient_id} sent to Unurgent Care`);
                clearSchedSelections();
                await loadSchedulingSection();
            }
        } catch (e) {
            if (errEl) errEl.textContent = 'Network error. Please try again.';
        }
        btn.disabled    = !selPatient;
        btn.textContent = '🟢 Send to Unurgent Care';
        return;
    }

    // ── Standard bed assignment path ──────────────────────────────────────────
    if (!selBed) {
        if (errEl) errEl.textContent = 'Patient and Bed are required to create an assignment.';
        return;
    }

    btn.disabled    = true;
    btn.textContent = 'Saving...';

    const arrivalEl = document.getElementById('sch-arrival-time');
    const body = {
        patient_id: selPatient.patient_id,
        stay_id:    selPatient.stay_id,
        bed_id:     selBed.bed_id,
    };
    if (selDoctor)        body.doctor_id          = selDoctor.id;
    if (selNurse1)        body.nurse1_id           = selNurse1.id;
    if (selNurse2)        body.nurse2_id           = selNurse2.id;
    if (arrivalEl?.value) body.bed_occupation_time = arrivalEl.value;

    try {
        const res  = await fetch(SCHED_BASE + '/assign', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
            if (errEl) errEl.textContent = parseApiError(data.detail);
        } else {
            showMessage('Assignment created successfully!', 'success');
            notifyDataChange('scheduling', `Patient #${selPatient.patient_id} assigned to bed ${selBed.bed_number}`);
            clearSchedSelections();
            await loadSchedulingSection();
        }
    } catch (e) {
        if (errEl) errEl.textContent = 'Network error. Please try again.';
    }

    btn.disabled    = !(selPatient && selBed);
    btn.textContent = '✓ Confirm Assignment';
}

async function deleteSchedAssignment(patientId, bedId) {
    if (!confirm(`Remove assignment for patient #${patientId} from bed #${bedId}? This cannot be undone.`)) return;
    try {
        const res = await fetch(SCHED_BASE + `/delete/${patientId}/${bedId}`, { method: 'DELETE' });
        if (res.ok) {
            showMessage('Assignment removed.', 'success');
            notifyDataChange('scheduling', `Assignment for Patient #${patientId} removed`);
            await loadSchedAssignments();
        } else {
            const data = await res.json();
            showMessage(data.detail || 'Failed to delete assignment.', 'error');
        }
    } catch (e) {
        showMessage('Network error.', 'error');
    }
}

// ── Assignments table ──────────────────────────────────────────────────────────

function filterSchedAssignments() {
    const q = (document.getElementById('sch-assignments-search')?.value || '').toLowerCase().trim();
    _renderAssignmentsTable(q);
}

function _renderAssignmentsTable(search) {
    // Render the current-assignments table with Edit / Discharge / Delete actions per row
    const el = document.getElementById('sch-assignments-table');
    if (!el) return;
    if (!schedAssignments.length) {
        el.innerHTML = `<div class="sch-empty">
            <span class="sch-empty-icon">📋</span>
            No assignments yet. Select resources above and confirm to create one.
        </div>`;
        return;
    }

    const q = (search ?? document.getElementById('sch-assignments-search')?.value ?? '').toLowerCase().trim();

    const rows = schedAssignments.filter(a => {
        if (!q) return true;
        const bed = schedBeds.find(x => x.bed_id == a.bed_id);
        const bedLabel = bed ? bed.bed_number.toLowerCase() : String(a.bed_id);
        return (
            String(a.patient_id).includes(q) ||
            bedLabel.includes(q) ||
            (a.doctor_id  && String(a.doctor_id).includes(q)) ||
            (a.nurse1_id  && String(a.nurse1_id).includes(q)) ||
            (a.nurse2_id  && String(a.nurse2_id).includes(q))
        );
    });

    if (!rows.length) {
        el.innerHTML = `<div class="sch-empty">
            <span class="sch-empty-icon">🔍</span>
            No assignments match <strong>${q}</strong>.
        </div>`;
        return;
    }

    el.innerHTML = `
        <div style="overflow-x:auto">
        <table class="s-table">
            <thead>
                <tr>
                    <th>Patient ID</th>
                    <th>Bed</th>
                    <th>Bed Type</th>
                    <th>Doctor</th>
                    <th>Nurse 1</th>
                    <th>Nurse 2</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(a => {
                    const bed      = schedBeds.find(x => x.bed_id == a.bed_id);
                    const bedLabel = bed ? bed.bed_number : a.bed_id;
                    const btype    = bed ? (bed.bed_type || 'normal') : null;
                    const pat      = schedPatients.find(x => x.patient_id == a.patient_id);
                    const patLabel = pat && pat.name
                        ? `${_typeBadge(a.patient_id, '#3b82f6')}<br><span style="font-size:11px;color:#6b7280">${pat.name}${pat.age != null ? ', ' + pat.age : ''}${pat.gender ? ' · ' + pat.gender : ''}</span>`
                        : _typeBadge(a.patient_id, '#3b82f6');
                    const doc      = schedDoctors.find(x => x.id == a.doctor_id);
                    const docLabel = a.doctor_id
                        ? `${_typeBadge(a.doctor_id, '#10b981')}${doc && doc.name ? '<br><span style="font-size:11px;color:#6b7280">' + doc.name + '</span>' : ''}`
                        : '<span class="sch-none">—</span>';
                    const n1       = schedNurses.find(x => x.id == a.nurse1_id);
                    const n1Label  = a.nurse1_id
                        ? `${_typeBadge(a.nurse1_id, '#8b5cf6')}${n1 && n1.name ? '<br><span style="font-size:11px;color:#6b7280">' + n1.name + '</span>' : ''}`
                        : '<span class="sch-none">—</span>';
                    const n2       = schedNurses.find(x => x.id == a.nurse2_id);
                    const n2Label  = a.nurse2_id
                        ? `${_typeBadge(a.nurse2_id, '#a855f7')}${n2 && n2.name ? '<br><span style="font-size:11px;color:#6b7280">' + n2.name + '</span>' : ''}`
                        : '<span class="sch-none">—</span>';
                    return `
                <tr>
                    <td>${patLabel}</td>
                    <td>${_typeBadge(bedLabel, '#f59e0b')}</td>
                    <td>${btype ? `<span class="bed-type-badge type-${btype.toLowerCase()}">${btype}</span>` : '<span class="sch-none">—</span>'}</td>
                    <td>${docLabel}</td>
                    <td>${n1Label}</td>
                    <td>${n2Label}</td>
                    <td style="white-space:nowrap">
                        <button class="s-action-btn s-edit-btn" onclick="openSchedEditModal(${a.patient_id}, ${a.bed_id})">✏️ Edit</button>
                        <button class="s-action-btn s-discharge-btn" onclick="openDischargeModal(${a.patient_id}, ${a.bed_id})">🚪 Discharge</button>
                        <button class="s-action-btn s-del-btn" onclick="deleteSchedAssignment(${a.patient_id}, ${a.bed_id})">🗑️ Delete</button>
                    </td>
                </tr>`;
                }).join('')}
            </tbody>
        </table>
        </div>`;
}

function _typeBadge(val, color) {
    // Render a small coloured badge for IDs in the assignments table
    return `<span class="sch-type-badge" style="background:${color}18;color:${color};border:1px solid ${color}38">${val}</span>`;
}

// ── Discharge modal ────────────────────────────────────────────────────────────

let _dischargePatientId = null;
let _dischargeBedId     = null;

function openDischargeModal(patientId, bedId) {
    // Pre-fill the discharge modal with patient/bed info and a default departure time of now
    _dischargePatientId = patientId;
    _dischargeBedId     = bedId;

    const now = nowLocalIso();
    document.getElementById('discharge-departure-time').value = now;
    document.getElementById('discharge-modal-info').innerHTML =
        `You are about to discharge <strong>Patient #${patientId}</strong> from <strong>Bed #${bedId}</strong>.<br>
         The patient record will be saved to the log and removed from daily patients.`;
    const errEl = document.getElementById('discharge-error');
    errEl.textContent  = '';
    errEl.style.display = 'none';

    const btn = document.getElementById('discharge-confirm-btn');
    btn.disabled    = false;
    btn.textContent = 'Discharge Patient';

    document.getElementById('discharge-modal').style.display = 'block';
}

function closeDischargeModal() {
    document.getElementById('discharge-modal').style.display = 'none';
    _dischargePatientId = null;
    _dischargeBedId     = null;
}

async function confirmDischarge() {
    // POST the departure time to the scheduling/discharge endpoint
    const departureTime = document.getElementById('discharge-departure-time').value;
    const errEl = document.getElementById('discharge-error');

    if (!departureTime) {
        errEl.textContent  = 'Please set a departure time.';
        errEl.style.display = 'block';
        return;
    }
    errEl.textContent  = '';
    errEl.style.display = 'none';

    const btn = document.getElementById('discharge-confirm-btn');
    btn.disabled    = true;
    btn.textContent = 'Discharging…';

    try {
        const res = await fetch(`${SCHED_BASE}/discharge/${_dischargePatientId}/${_dischargeBedId}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ departure_time: departureTime }),
        });
        const data = await res.json();
        if (!res.ok) {
            errEl.textContent  = parseApiError(data.detail) || 'Failed to discharge patient.';
            errEl.style.display = 'block';
            btn.disabled    = false;
            btn.textContent = 'Discharge Patient';
        } else {
            const pid = _dischargePatientId;
            closeDischargeModal();
            showMessage('Patient discharged and moved to log successfully.', 'success');
            notifyDataChange('scheduling', `Patient #${pid} discharged and moved to log`);
            await loadSchedAssignments();
        }
    } catch (e) {
        errEl.textContent  = 'Network error. Please try again.';
        errEl.style.display = 'block';
        btn.disabled    = false;
        btn.textContent = 'Discharge Patient';
    }
}

// ── Edit Assignment modal ──────────────────────────────────────────────────────

let _editPatientId = null;
let _editBedId     = null;
let _editStayId    = null;

function openSchedEditModal(patientId, bedId) {
    // Populate the edit modal with current assignment data, allowing the user
    // to change the bed, doctor, nurses, and bed occupation time
    const a = schedAssignments.find(x => x.patient_id == patientId && x.bed_id == bedId);
    if (!a) return;

    _editPatientId = patientId;
    _editBedId     = bedId;

    const patient = schedPatients.find(x => x.patient_id == patientId);
    _editStayId   = patient ? patient.stay_id : null;

    document.getElementById('sched-edit-modal-info').innerHTML =
        `Editing assignment for <strong>Patient #${patientId}</strong>` +
        (_editStayId ? ` (Stay #${_editStayId})` : '') +
        ` — currently on <strong>Bed #${bedId}</strong>`;

    // Bed dropdown: only Available beds + the currently assigned bed (always shown)
    const bedSel = document.getElementById('sched-edit-bed');
    bedSel.innerHTML = schedBeds
        .filter(b => b.bed_status === 'Available' || b.bed_id == bedId)
        .map(b => {
            const btype = b.bed_type || 'normal';
            const label = b.bed_id == bedId ? `🛏️ ${b.bed_number} [${btype}] (current)` : `🛏️ ${b.bed_number} [${btype}]`;
            return `<option value="${b.bed_id}"${b.bed_id == bedId ? ' selected' : ''}>${label}</option>`;
        }).join('');

    // Doctor dropdown with a "None" option so the doctor can be removed
    const docSel = document.getElementById('sched-edit-doctor');
    docSel.innerHTML = '<option value="">— None —</option>' +
        schedDoctors.map(d => {
            const type = d.intern_or_not === 'doctor' ? 'Doctor' : 'Intern';
            const dName = d.name ? ' · ' + d.name : '';
            return `<option value="${d.id}"${d.id == a.doctor_id ? ' selected' : ''}>#${d.id}${dName} · ${type} · ${d.shift}</option>`;
        }).join('');

    // Nurse dropdowns — both can be set independently; same nurse cannot be in both slots
    const nurseOpts = '<option value="">— None —</option>' +
        schedNurses.map(n => {
            const nName = n.name ? ' · ' + n.name : '';
            return `<option value="${n.id}">#${n.id}${nName} · ${n.role} · ${n.shift}</option>`;
        }).join('');
    const n1Sel = document.getElementById('sched-edit-nurse1');
    const n2Sel = document.getElementById('sched-edit-nurse2');
    n1Sel.innerHTML = nurseOpts;
    n2Sel.innerHTML = nurseOpts;
    if (a.nurse1_id) n1Sel.value = a.nurse1_id;
    if (a.nurse2_id) n2Sel.value = a.nurse2_id;

    // Pre-fill bed occupation time from the patient's record if available
    const occEl = document.getElementById('sched-edit-occupation-time');
    occEl.value = (patient && patient.bed_occupation_time)
        ? patient.bed_occupation_time.slice(0, 16)
        : '';

    const errEl = document.getElementById('sched-edit-error');
    errEl.textContent   = '';
    errEl.style.display = 'none';

    const btn = document.getElementById('sched-edit-confirm-btn');
    btn.disabled    = false;
    btn.textContent = 'Save Changes';

    document.getElementById('sched-edit-modal').style.display = 'block';
}

function closeSchedEditModal() {
    document.getElementById('sched-edit-modal').style.display = 'none';
    _editPatientId = null;
    _editBedId     = null;
    _editStayId    = null;
}

async function saveSchedEdit() {
    // Validate then PUT the updated assignment to the API
    const errEl    = document.getElementById('sched-edit-error');
    const newBedId = parseInt(document.getElementById('sched-edit-bed').value);
    const doctorId = document.getElementById('sched-edit-doctor').value || null;
    const nurse1Id = document.getElementById('sched-edit-nurse1').value || null;
    const nurse2Id = document.getElementById('sched-edit-nurse2').value || null;
    const occTime  = document.getElementById('sched-edit-occupation-time').value || null;

    if (!newBedId) {
        errEl.textContent   = 'Please select a bed.';
        errEl.style.display = 'block';
        return;
    }
    // Prevent assigning the same nurse to both slots
    if (nurse1Id && nurse2Id && nurse1Id === nurse2Id) {
        errEl.textContent   = 'Nurse 1 and Nurse 2 must be different.';
        errEl.style.display = 'block';
        return;
    }
    errEl.textContent   = '';
    errEl.style.display = 'none';

    const btn = document.getElementById('sched-edit-confirm-btn');
    btn.disabled    = true;
    btn.textContent = 'Saving…';

    const body = { new_bed_id: newBedId };
    if (doctorId) body.doctor_id = parseInt(doctorId);
    if (nurse1Id) body.nurse1_id = parseInt(nurse1Id);
    if (nurse2Id) body.nurse2_id = parseInt(nurse2Id);
    if (occTime)  body.bed_occupation_time = occTime;
    if (_editStayId) body.stay_id = _editStayId;

    try {
        const res  = await fetch(`${SCHED_BASE}/edit/${_editPatientId}/${_editBedId}`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
            errEl.textContent   = parseApiError(data.detail) || 'Failed to update assignment.';
            errEl.style.display = 'block';
            btn.disabled    = false;
            btn.textContent = 'Save Changes';
        } else {
            closeSchedEditModal();
            showMessage('Assignment updated successfully.', 'success');
            // Full reload so all panels reflect the updated state
            await loadSchedulingSection();
        }
    } catch (e) {
        errEl.textContent   = 'Network error. Please try again.';
        errEl.style.display = 'block';
        btn.disabled    = false;
        btn.textContent = 'Save Changes';
    }
}

// Refresh all scheduling lists whenever any data changes and this section is open
onDataChange(function() {
    if (document.getElementById('scheduling')?.classList.contains('active')) {
        loadSchedulingSection();
    }
});
