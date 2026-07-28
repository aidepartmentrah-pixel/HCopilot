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
}

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
    const fmt  = v => (v !== null && v !== undefined ? v : dash);

    const acuityBadge = v => {
        if (v == null) return dash;
        const lvl = Math.round(v);
        const cls = (lvl >= 1 && lvl <= 5) ? 's-acuity-' + lvl : '';
        const labels = { 1:'Immediate', 2:'Emergent', 3:'Urgent', 4:'Less Urgent', 5:'Non-Urgent' };
        return '<span class="s-acuity ' + cls + '" title="' + (labels[lvl] || lvl) + '">' + v + '</span>';
    };

    const o2Cell   = v => v == null ? dash : '<span class="' + (v < 95 ? 's-vital-warn' : v >= 98 ? 's-vital-ok' : '') + '">' + v + '%</span>';
    const hrCell   = v => v == null ? dash : '<span class="' + ((v < 60 || v > 100) ? 's-vital-warn' : 's-vital-ok') + '">' + v + '</span>';
    const tempCell = v => v == null ? dash : '<span class="' + ((v < 35.5 || v > 38.0) ? 's-vital-warn' : '') + '">' + v + '°C</span>';
    const complaint = v => {
        if (v == null) return dash;
        const s = String(v);
        return s.length > 22 ? '<span title="' + s.replace(/"/g, '&quot;') + '">' + s.slice(0, 22) + '…</span>' : s;
    };

    const genderBadge = v => {
        if (!v) return dash;
        const cls = v === 'Male' ? 'pat-gender-m' : v === 'Female' ? 'pat-gender-f' : 'pat-gender-o';
        return '<span class="pat-gender-badge ' + cls + '">' + v + '</span>';
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
        '<tr>' +
        '<td class="s-td-id">' + p.subject_id + '</td>' +
        '<td class="s-td-id">' + p.stay_id + '</td>' +
        '<td>' + fmt(p.name) + '</td>' +
        '<td>' + genderBadge(p.gender) + '</td>' +
        '<td>' + fmt(p.age) + '</td>' +
        '<td class="pat-td-arrival">' + _formatDatetime(p.arrival_time) + '</td>' +
        '<td class="pat-td-arrival">' + _formatDatetime(p.departure_time) + '</td>' +
        '<td>' + destinationBadge(p.destination) + '</td>' +
        '<td>' + (p.bed_occupation_time != null ? p.bed_occupation_time : dash) + '</td>' +
        '<td class="pat-td-bedhist">' + (p.bed_history ? p.bed_history : dash) + '</td>' +
        '<td>' + tempCell(p.temperature) + '</td>' +
        '<td>' + hrCell(p.heartrate) + '</td>' +
        '<td>' + fmt(p.resprate) + '</td>' +
        '<td>' + o2Cell(p.o2sat) + '</td>' +
        '<td>' + fmt(p.sbp) + '</td>' +
        '<td>' + fmt(p.dbp) + '</td>' +
        '<td>' + fmt(p.pain) + '</td>' +
        '<td>' + acuityBadge(p.acuity) + '</td>' +
        '<td>' + complaint(p.chiefcomplaint) + '</td>' +
        '<td class="s-td-actions">' +
            '<button class="s-action-btn s-edit-btn" data-action="edit-log-patient" ' +
                'data-row=\'' + _safeAttr(JSON.stringify(p)) + '\'>✏️ Edit</button>' +
            '<button class="s-action-btn s-del-btn" data-action="delete-log-patient" ' +
                'data-stayid="' + p.stay_id + '">🗑️ Delete</button>' +
        '</td>' +
        '</tr>'
    ).join('');

    container.innerHTML =
        '<div class="s-table-wrap"><table class="s-table">' +
        '<thead><tr>' +
        '<th>Patient ID</th><th>Stay ID</th><th>Name</th><th>Gender</th><th>Age</th>' +
        '<th>Arrival Time</th><th>Departure Time</th><th>Destination</th><th>Bed Occupation</th><th>Bed History</th>' +
        '<th>Temp</th><th>HR</th><th>RR</th>' +
        '<th>O₂ Sat</th><th>SBP</th><th>DBP</th><th>Pain</th><th>Acuity</th><th>Chief Complaint</th>' +
        '<th style="width:170px">Actions</th>' +
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
    const fmt  = v => (v !== null && v !== undefined ? v : dash);

    const acuityBadge = v => {
        if (v == null) return dash;
        const lvl = Math.round(v);
        const cls = (lvl >= 1 && lvl <= 5) ? 's-acuity-' + lvl : '';
        const labels = { 1:'Immediate', 2:'Emergent', 3:'Urgent', 4:'Less Urgent', 5:'Non-Urgent' };
        return '<span class="s-acuity ' + cls + '" title="' + (labels[lvl] || lvl) + '">' + v + '</span>';
    };

    const o2Cell = v => {
        if (v == null) return dash;
        const cls = v < 95 ? 's-vital-warn' : (v >= 98 ? 's-vital-ok' : '');
        return '<span class="' + cls + '">' + v + '%</span>';
    };

    const hrCell = v => {
        if (v == null) return dash;
        const cls = (v < 60 || v > 100) ? 's-vital-warn' : 's-vital-ok';
        return '<span class="' + cls + '">' + v + '</span>';
    };

    const tempCell = v => {
        if (v == null) return dash;
        const cls = (v < 35.5 || v > 38.0) ? 's-vital-warn' : '';
        return '<span class="' + cls + '">' + v + '°C</span>';
    };

    const complaint = v => {
        if (v == null) return dash;
        const s = String(v);
        return s.length > 22
            ? '<span title="' + s.replace(/"/g, '&quot;') + '">' + s.slice(0, 22) + '…</span>'
            : s;
    };

    const bedCell = p => {
        const b = patientBedMap[p.patient_id];
        if (!b) return dash;
        const btype = b.bed_type || 'normal';
        return '<span class="s-bed-num-pill">' + b.bed_number + '</span> ' +
               '<span class="bed-type-badge type-' + btype.toLowerCase() + '">' + btype + '</span>';
    };

    const genderBadge = v => {
        if (!v) return dash;
        const cls = v === 'Male' ? 'pat-gender-m' : v === 'Female' ? 'pat-gender-f' : 'pat-gender-o';
        return '<span class="pat-gender-badge ' + cls + '">' + v + '</span>';
    };

    const rows = patients.map(p => {
        const bed = patientBedMap[p.patient_id];
        return '<tr>' +
        '<td class="s-td-id">' + p.patient_id + '</td>' +
        '<td class="s-td-id">' + p.stay_id + '</td>' +
        '<td>' + fmt(p.name) + '</td>' +
        '<td>' + genderBadge(p.gender) + '</td>' +
        '<td>' + fmt(p.age) + '</td>' +
        '<td class="pat-td-arrival">' + _formatDatetime(p.arrival_time) + '</td>' +
        '<td class="pat-td-arrival">' + _formatDatetime(p.departure_time) + '</td>' +
        '<td>' + (p.bed_occupation_time != null ? p.bed_occupation_time : '<span class="s-null-dash">–</span>') + '</td>' +
        '<td>' + bedCell(p) + '</td>' +
        '<td class="pat-td-bedhist">' + (p.bed_history ? p.bed_history : dash) + '</td>' +
        '<td>' + tempCell(p.temperature) + '</td>' +
        '<td>' + hrCell(p.heartrate) + '</td>' +
        '<td>' + fmt(p.resprate) + '</td>' +
        '<td>' + o2Cell(p.o2sat) + '</td>' +
        '<td>' + fmt(p.sbp) + '</td>' +
        '<td>' + fmt(p.dbp) + '</td>' +
        '<td>' + fmt(p.pain) + '</td>' +
        '<td>' + acuityBadge(p.acuity) + '</td>' +
        '<td>' + complaint(p.chiefcomplaint) + '</td>' +
        '<td class="s-td-actions">' +
            '<button class="s-action-btn s-edit-btn" data-action="edit-patient" ' +
                'data-row=\'' + _safeAttr(JSON.stringify(p)) + '\'>✏️ Edit</button>' +
            '<button class="s-action-btn s-del-btn" data-action="delete-patient" ' +
                'data-stayid="' + p.stay_id + '">🗑️ Delete</button>' +
        '</td>' +
        '</tr>';
    }).join('');

    container.innerHTML =
        '<div class="s-table-wrap"><table class="s-table">' +
        '<thead><tr>' +
        '<th>Patient ID</th><th>Stay ID</th><th>Name</th><th>Gender</th><th>Age</th>' +
        '<th>Arrival Time</th><th>Departure Time</th><th>Bed Occupation</th>' +
        '<th>Bed</th><th>Bed History</th>' +
        '<th>Temp</th><th>HR</th><th>RR</th>' +
        '<th>O₂ Sat</th><th>SBP</th><th>DBP</th><th>Pain</th><th>Acuity</th><th>Chief Complaint</th>' +
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
    if (editBtn)    openEditPatientModal(JSON.parse(editBtn.dataset.row),    'daily');
    if (editLogBtn) openEditPatientModal(JSON.parse(editLogBtn.dataset.row), 'log');
    if (delBtn)     confirmDeletePatient(parseInt(delBtn.dataset.stayid),    'daily');
    if (delLogBtn)  confirmDeletePatient(parseInt(delLogBtn.dataset.stayid), 'log');
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

function clearPatientForm() {
    ['pat-name','pat-gender','pat-age',
     'pat-departure-time','pat-bed-occupation-time',
     'pat-temperature','pat-heartrate','pat-resprate',
     'pat-o2sat','pat-sbp','pat-dbp','pat-pain','pat-acuity','pat-chiefcomplaint']
        .forEach(id => { document.getElementById(id).value = ''; });
    setPatAddError('');
    initPatientForm();
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
    if (!patientId || patientId < 1) { setPatAddError('Patient ID must be a positive integer.'); return; }
    if (!stayId    || stayId    < 1) { setPatAddError('Stay ID must be a positive integer.'); return; }
    if (!name)                { setPatAddError('Name is required.'); return; }
    if (!gender)               { setPatAddError('Gender is required.'); return; }
    if (age    === null || age    < 0)                      { setPatAddError('Age is required and must be a positive number.'); return; }
    if (!arrival)              { setPatAddError('Arrival time is required.'); return; }
    if (temp   === null || temp   < 26  || temp   > 46)  { setPatAddError('Temperature is required and must be between 26 and 46 °C.'); return; }
    if (hr     === null || hr     < 20  || hr     > 300) { setPatAddError('Heart rate is required and must be between 20 and 300 bpm.'); return; }
    if (rr     === null || rr     < 4   || rr     > 100) { setPatAddError('Resp. rate is required and must be between 4 and 100.'); return; }
    if (o2     === null || o2     < 0   || o2     > 100) { setPatAddError('O₂ saturation is required and must be between 0 and 100 %.'); return; }
    if (sbp    === null || sbp    < 40  || sbp    > 300) { setPatAddError('SBP is required and must be between 40 and 300 mmHg.'); return; }
    if (dbp    === null || dbp    < 20  || dbp    > 200) { setPatAddError('DBP is required and must be between 20 and 200 mmHg.'); return; }
    if (!pain)                 { setPatAddError('Pain is required.'); return; }
    if (acuity === null || acuity < 1   || acuity > 5)   { setPatAddError('Acuity is required and must be between 1 and 5.'); return; }
    if (!chiefcomplaint)       { setPatAddError('Chief complaint is required.'); return; }

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

    const btn = document.getElementById('pat-add-btn');
    btn.disabled = true; btn.textContent = 'Adding…';

    try {
        const response = await fetch('/api/patients/add', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) { setPatAddError(parseApiError(result.detail) || 'Error ' + response.status); return; }
        clearPatientForm();
        showMessage(result.message, 'success');
        notifyDataChange('patient', `Patient #${patientId} added to daily patients`);
        loadPatients();
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
    document.getElementById('pedit-pain').value                = row.pain           != null ? row.pain           : '';
    document.getElementById('pedit-acuity').value              = row.acuity         != null ? row.acuity         : '';
    document.getElementById('pedit-chiefcomplaint').value      = row.chiefcomplaint != null ? row.chiefcomplaint : '';
    const destGroup = document.getElementById('pedit-destination-group');
    if (destGroup) destGroup.style.display = patEditSource === 'log' ? '' : 'none';
    splitDestination('pedit-destination', 'pedit-destination-detail', row.destination);
    setPatEditError('');
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
