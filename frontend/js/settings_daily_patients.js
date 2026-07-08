/**
 * settings_daily_patients.js
 *
 * Settings → Daily Patients sub-tab.
 * Manages full CRUD for DailyPatients.csv via /api/data/daily-patients/* endpoints.
 *
 * Only active (non-discharged) patient stays are shown here.
 * Discharged stays are moved to LogPatients.csv by the server on discharge.
 *
 * Bed linkage: each row may have a linked bed via the patient_bed relation.
 * A "Change Bed" button is shown when a bed is assigned; it opens the change_bed.js modal.
 *
 * Client-side vital-sign validation mirrors the server-side rules:
 *   temperature 26–46 °C, heartrate 20–300 bpm, resprate 4–100,
 *   o2sat 0–100 %, sbp 40–300, dbp 20–200, acuity 1–5.
 *
 * Global state:
 *   dpFormMode      — 'add' | 'edit'
 *   dpCurrentStayId — stay_id of the row being edited (null when adding)
 *   dpDeleteId      — stay_id queued for deletion
 *   allDpData       — full unfiltered patient array from the API
 *   dpBedMap        — subject_id → bed object for patients with an assigned bed
 */

// 'add' | 'edit'
let dpFormMode = 'add';
// stay_id of the row being edited (null when adding)
let dpCurrentStayId = null;
// stay_id queued for deletion (set by confirmDeleteDp)
let dpDeleteId = null;
// Full unfiltered array from the API; filtered in memory on search
let allDpData = [];
// subject_id → bed object for patients who are currently assigned to a bed
let dpBedMap = {};

// ── Bed map builder ────────────────────────────────────────────────────────────

/**
 * @description Builds dpBedMap by joining the patient_bed relation table with
 *   the full beds list.  Requires two parallel fetches.  Silently degrades to
 *   an empty map if either request fails (beds column just shows "–").
 * @returns {Promise<void>}
 */
async function _loadDpBedMap() {
    try {
        const [pbRes, bedsRes] = await Promise.all([
            fetch('http://localhost:8090/api/relations/patient_bed'),
            fetch('http://localhost:8090/api/beds/list'),
        ]);
        const pb   = await pbRes.json();
        const beds = await bedsRes.json();
        // Index beds by bed_id for O(1) lookup during the join below
        const bedsById = {};
        (beds.beds || []).forEach(b => { bedsById[b.bed_id] = b; });
        const map = {};
        // Join: for each patient_bed row, store the full bed object keyed by patient_id
        (pb.rows || []).forEach(r => {
            const b = bedsById[r.bed_id];
            if (b) map[r.patient_id] = b;
        });
        dpBedMap = map;
    } catch (_) {
        dpBedMap = {};
    }
}

// ── Modal backdrop click-to-close ──────────────────────────────────────────────
window.addEventListener('click', function(e) {
    if (e.target === document.getElementById('dp-form-modal'))   closeDpFormModal();
    if (e.target === document.getElementById('dp-delete-modal')) closeDpDeleteModal();
});

// ── Load ───────────────────────────────────────────────────────────────────────

/**
 * @description Entry point for the Daily Patients settings tab.
 *   Fetches patient list + stats in parallel, then builds the bed map, and
 *   renders the table.
 * @returns {Promise<void>}
 */
async function loadDailyPatientsSettings() {
    const container = document.getElementById('settings-dp-container');
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading daily patients...</div>';
    document.getElementById('dp-stats-bar').style.display  = 'none';
    document.getElementById('dp-filter-bar').style.display = 'none';

    try {
        const [listRes, statsRes] = await Promise.all([
            fetch('http://localhost:8090/api/data/daily-patients/list'),
            fetch('http://localhost:8090/api/data/daily-patients/stats')
        ]);
        const listData  = await listRes.json();
        const statsData = await statsRes.json();
        if (!listRes.ok)  throw new Error(listData.detail  || 'HTTP ' + listRes.status);
        if (!statsRes.ok) throw new Error(statsData.detail || 'HTTP ' + statsRes.status);

        // Build the bed map before rendering so the Bed column is populated
        await _loadDpBedMap();
        allDpData = listData.patients;

        if (allDpData.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><h3>No Patient Stays Found</h3><p>Click "Add Stay" to get started.</p></div>';
            return;
        }

        document.getElementById('dp-stat-total').textContent    = statsData.total;
        document.getElementById('dp-stat-subjects').textContent = statsData.unique_subjects;
        document.getElementById('dp-stats-bar').style.display   = 'flex';

        document.getElementById('dp-search').value = '';
        document.getElementById('dp-filter-bar').style.display = 'flex';

        renderDpTable(allDpData);
    } catch (error) {
        container.innerHTML = '<div class="error-state"><div class="error-icon">❌</div><h3>Error Loading Data</h3><p>' + error.message + '</p></div>';
    }
}

// ── Filter ─────────────────────────────────────────────────────────────────────

/**
 * @description Filters allDpData by the search term and re-renders the table.
 *   Matches against subject_id, stay_id, name, and chief complaint.
 * @returns {void}
 */
function filterDailyPatients() {
    const search = document.getElementById('dp-search').value.toLowerCase().trim();
    const filtered = allDpData.filter(p =>
        !search
        || String(p.subject_id).includes(search)
        || String(p.stay_id).includes(search)
        || (p.name && p.name.toLowerCase().includes(search))
        || (p.chiefcomplaint && p.chiefcomplaint.toLowerCase().includes(search))
    );
    renderDpTable(filtered);
}

// ── Render ─────────────────────────────────────────────────────────────────────

/**
 * @description Renders the full daily-patients table with colour-coded vital signs,
 *   acuity badges, a Bed column (from dpBedMap), and action buttons.
 *   Long chief complaints are truncated with a tooltip for the full text.
 * @param {Array<Object>} patients - Array of patient objects (may be filtered).
 * @returns {void}
 */
function renderDpTable(patients) {
    const container = document.getElementById('settings-dp-container');
    const countEl   = document.getElementById('dp-visible-count');
    if (countEl) countEl.textContent = patients.length + ' record' + (patients.length !== 1 ? 's' : '');

    if (patients.length === 0) {
        container.innerHTML = '<div class="s-no-results"><div class="s-no-results-icon">🔍</div><p>No records match your filters.</p></div>';
        return;
    }

    // Helper to render null/undefined values as a dash
    const dash = '<span class="s-null-dash">–</span>';
    const fmt  = v => (v !== null && v !== undefined ? v : dash);

    // Acuity badge: colour-coded pill with ESI level label as title tooltip
    const acuityBadge = v => {
        if (v == null) return dash;
        const lvl = Math.round(v);
        const cls = lvl >= 1 && lvl <= 5 ? 's-acuity-' + lvl : '';
        const labels = { 1:'Immediate', 2:'Emergent', 3:'Urgent', 4:'Less Urgent', 5:'Non-Urgent' };
        return '<span class="s-acuity ' + cls + '" title="' + (labels[lvl] || lvl) + '">' + v + '</span>';
    };

    // O₂ saturation: warn below 95 %, green at 98 %+
    const o2Cell = v => {
        if (v == null) return dash;
        const cls = v < 95 ? 's-vital-warn' : (v >= 98 ? 's-vital-ok' : '');
        return '<span class="' + cls + '">' + v + '%</span>';
    };

    // Heart rate: warn outside normal range 60–100 bpm
    const hrCell = v => {
        if (v == null) return dash;
        const cls = (v < 60 || v > 100) ? 's-vital-warn' : 's-vital-ok';
        return '<span class="' + cls + '">' + v + '</span>';
    };

    // Temperature: warn outside normal range 35.5–38.0 °C
    const tempCell = v => {
        if (v == null) return dash;
        const cls = (v < 35.5 || v > 38.0) ? 's-vital-warn' : '';
        return '<span class="' + cls + '">' + v + '°C</span>';
    };

    // Chief complaint: truncate at 22 chars, show full text in a tooltip
    const complaint = v => {
        if (v == null) return dash;
        const s = String(v);
        return s.length > 22
            ? '<span title="' + s.replace(/"/g, '&quot;') + '">' + s.slice(0, 22) + '…</span>'
            : s;
    };

    // Format ISO datetime strings to a human-readable locale string
    const fmtDt = v => {
        if (!v) return '<span class="s-null-dash">–</span>';
        try {
            const d = new Date(v);
            if (isNaN(d)) return v;
            return d.toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
        } catch (_) { return v; }
    };

    // Bed column: shows bed_number pill + bed_type badge, or a dash if no bed
    const bedCell = p => {
        const b = dpBedMap[p.subject_id];
        if (!b) return dash;
        const btype = b.bed_type || 'normal';
        return '<span class="s-bed-num-pill">' + b.bed_number + '</span> ' +
               '<span class="bed-type-badge type-' + btype.toLowerCase() + '">' + btype + '</span>';
    };

    // Gender badge: colour varies by value
    const genderBadge = v => {
        if (!v) return dash;
        const cls = v === 'Male' ? 'pat-gender-m' : v === 'Female' ? 'pat-gender-f' : 'pat-gender-o';
        return '<span class="pat-gender-badge ' + cls + '">' + v + '</span>';
    };

    const rows = patients.map(p => {
        // Look up whether this patient has a bed so we know whether to render the Change Bed button
        const bed = dpBedMap[p.subject_id];
        return '<tr>' +
        '<td class="s-td-id">' + p.subject_id + '</td>' +
        '<td class="s-td-id">' + p.stay_id + '</td>' +
        '<td>' + fmt(p.name) + '</td>' +
        '<td>' + genderBadge(p.gender) + '</td>' +
        '<td>' + fmt(p.age) + '</td>' +
        '<td>' + fmtDt(p.arrival_time) + '</td>' +
        '<td>' + fmtDt(p.departure_time) + '</td>' +
        '<td>' + (p.bed_occupation_time != null ? p.bed_occupation_time : '<span class="s-null-dash">–</span>') + '</td>' +
        '<td>' + bedCell(p) + '</td>' +
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
            // JSON.stringify the whole row as a data attribute so the edit handler
            // does not need an extra API call to retrieve the current values
            '<button class="s-action-btn s-edit-btn" data-action="edit-dp" ' +
                'data-row=\'' + _safeAttr(JSON.stringify(p)) + '\'>✏️ Edit</button>' +
            // Only show "Change Bed" when the patient already has a bed assigned
            (bed
                ? '<button class="s-action-btn s-edit-btn" data-action="change-bed-dp" ' +
                    'data-patient="' + p.subject_id + '" data-bed="' + bed.bed_id + '" data-bednum="' + bed.bed_number + '">🔄 Bed</button>'
                : '') +
            '<button class="s-action-btn s-del-btn" data-action="delete-dp" ' +
                'data-stayid="' + p.stay_id + '">🗑️ Delete</button>' +
        '</td>' +
        '</tr>';
    }).join('');

    container.innerHTML =
        '<div class="s-table-wrap"><table class="s-table">' +
        '<thead><tr>' +
        '<th>Subject ID</th><th>Stay ID</th><th>Name</th><th>Gender</th><th>Age</th>' +
        '<th>Arrival Time</th><th>Departure Time</th><th>Bed Occupation</th>' +
        '<th>Bed</th>' +
        '<th>Temp</th><th>HR</th><th>RR</th>' +
        '<th>O₂ Sat</th><th>SBP</th><th>DBP</th><th>Pain</th><th>Acuity</th><th>Chief Complaint</th>' +
        '<th style="width:220px">Actions</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
        '</table></div>' +
        '<div class="s-table-footer">' + patients.length + ' records shown' +
        (patients.length < allDpData.length ? ' <span class="s-filter-hint">(filtered from ' + allDpData.length + ' total)</span>' : '') +
        '</div>';
}

// ── Delegated click handler for table action buttons ──────────────────────────
document.addEventListener('click', function(e) {
    const editBtn      = e.target.closest('[data-action="edit-dp"]');
    const delBtn       = e.target.closest('[data-action="delete-dp"]');
    const changeBedBtn = e.target.closest('[data-action="change-bed-dp"]');
    // Parse the JSON row object embedded in data-row for the edit handler
    if (editBtn) openEditDpModal(JSON.parse(editBtn.dataset.row));
    if (delBtn)  confirmDeleteDp(parseInt(delBtn.dataset.stayid));
    if (changeBedBtn) {
        // openChangeBedModal is defined in change_bed.js
        openChangeBedModal(
            parseInt(changeBedBtn.dataset.patient),
            parseInt(changeBedBtn.dataset.bed),
            changeBedBtn.dataset.bednum
        );
    }
});

// ── Form helpers ───────────────────────────────────────────────────────────────

/**
 * @description Shows or hides the inline form error element in the DP form modal.
 * @param {string} msg - Error text, or empty string to hide.
 * @returns {void}
 */
function setDpFormError(msg) {
    const el = document.getElementById('dp-form-error');
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
}

/**
 * @description Clears all input fields in the add/edit patient form.
 *   Used when switching the modal to "add" mode to avoid residual values.
 * @returns {void}
 */
function _dpClear() {
    ['dp-subject-id','dp-stay-id','dp-name','dp-age',
     'dp-arrival-time','dp-departure-time','dp-bed-occupation-time',
     'dp-temperature','dp-heartrate','dp-resprate',
     'dp-o2sat','dp-sbp','dp-dbp','dp-pain','dp-acuity','dp-chiefcomplaint']
        .forEach(id => { document.getElementById('form-' + id).value = ''; });
    document.getElementById('form-dp-gender').value = '';
}

/**
 * @description Auto-computes a bed_occupation_time label when both arrival and
 *   departure are set.  This is a UI convenience only — the real timestamps are
 *   stored as ISO strings and this just populates the duration display field.
 * @returns {void}
 */
function dpAutoOccupation() {
    const arr = document.getElementById('form-dp-arrival-time').value;
    const dep = document.getElementById('form-dp-departure-time').value;
    if (arr && dep) {
        // Calculate the difference in hours
        const diff = (new Date(dep) - new Date(arr)) / 3600000;
        if (!isNaN(diff) && diff > 0) {
            document.getElementById('form-dp-bed-occupation-time').value = diff.toFixed(2) + 'h';
        }
    }
}

// ── Modal open/close ──────────────────────────────────────────────────────────

/**
 * @description Opens the patient form modal in "add" mode.
 *   The stay_id field is editable in add mode so the user can provide a custom ID.
 * @returns {void}
 */
function openAddDpModal() {
    dpFormMode = 'add';
    dpCurrentStayId = null;
    document.getElementById('dp-form-title').textContent = 'Add Patient Stay';
    _dpClear();
    // In edit mode the stay_id is made readonly; ensure it is editable in add mode
    document.getElementById('form-dp-stay-id').removeAttribute('readonly');
    setDpFormError('');
    document.getElementById('dp-form-modal').style.display = 'block';
    setTimeout(() => document.getElementById('form-dp-subject-id').focus(), 100);
}

/**
 * @description Opens the patient form modal in "edit" mode, pre-populating all
 *   fields from the row object.  ISO datetime strings are truncated to 16 chars
 *   (YYYY-MM-DDTHH:MM) to match the datetime-local input format.
 * @param {Object} row - Full patient row object from the API.
 * @returns {void}
 */
function openEditDpModal(row) {
    dpFormMode = 'edit';
    dpCurrentStayId = row.stay_id;
    document.getElementById('dp-form-title').textContent = 'Edit Stay #' + row.stay_id;
    document.getElementById('form-dp-subject-id').value           = row.subject_id;
    document.getElementById('form-dp-stay-id').value              = row.stay_id;
    // Stay ID cannot be changed when editing — lock the field
    document.getElementById('form-dp-stay-id').setAttribute('readonly', true);
    document.getElementById('form-dp-name').value                 = row.name          != null ? row.name          : '';
    document.getElementById('form-dp-gender').value               = row.gender        != null ? row.gender        : '';
    document.getElementById('form-dp-age').value                  = row.age           != null ? row.age           : '';
    // Slice to 16 chars to strip seconds/timezone from ISO strings for datetime-local input
    document.getElementById('form-dp-arrival-time').value         = row.arrival_time   ? String(row.arrival_time).slice(0, 16)   : '';
    document.getElementById('form-dp-departure-time').value       = row.departure_time ? String(row.departure_time).slice(0, 16) : '';
    document.getElementById('form-dp-bed-occupation-time').value  = row.bed_occupation_time != null ? row.bed_occupation_time : '';
    document.getElementById('form-dp-temperature').value          = row.temperature  != null ? row.temperature  : '';
    document.getElementById('form-dp-heartrate').value            = row.heartrate    != null ? row.heartrate    : '';
    document.getElementById('form-dp-resprate').value             = row.resprate     != null ? row.resprate     : '';
    document.getElementById('form-dp-o2sat').value                = row.o2sat        != null ? row.o2sat        : '';
    document.getElementById('form-dp-sbp').value                  = row.sbp          != null ? row.sbp          : '';
    document.getElementById('form-dp-dbp').value                  = row.dbp          != null ? row.dbp          : '';
    document.getElementById('form-dp-pain').value                 = row.pain         != null ? row.pain         : '';
    document.getElementById('form-dp-acuity').value               = row.acuity       != null ? row.acuity       : '';
    document.getElementById('form-dp-chiefcomplaint').value       = row.chiefcomplaint != null ? row.chiefcomplaint : '';
    setDpFormError('');
    document.getElementById('dp-form-modal').style.display = 'block';
}

/**
 * @description Closes the DP form modal and ensures the stay_id field is editable
 *   again in case the modal is reopened in add mode.
 * @returns {void}
 */
function closeDpFormModal() {
    document.getElementById('dp-form-modal').style.display = 'none';
    // Restore editability for the next add-mode open
    document.getElementById('form-dp-stay-id').removeAttribute('readonly');
}

/**
 * @description Parses a form field value as float, returning null if blank.
 *   Used for all optional numeric vital-sign fields.
 * @param {string} id - The id suffix after "form-" of the input element.
 * @returns {number|null}
 */
function _dpFloatOrNull(id) {
    const v = document.getElementById('form-' + id).value.trim();
    return v === '' ? null : parseFloat(v);
}

// ── Save ───────────────────────────────────────────────────────────────────────

/**
 * @description Validates all form fields against the documented ranges, then
 *   POSTs (add) or PUTs (edit) the payload to the API.  All vital fields are
 *   optional; blank inputs are sent as null.  Vital ranges are enforced
 *   client-side to match server-side validation and give instant feedback.
 * @returns {Promise<void>}
 */
async function saveDpForm() {
    const subjectId = parseInt(document.getElementById('form-dp-subject-id').value);
    const stayId    = parseInt(document.getElementById('form-dp-stay-id').value);

    const temperature = _dpFloatOrNull('dp-temperature');
    const heartrate   = _dpFloatOrNull('dp-heartrate');
    const resprate    = _dpFloatOrNull('dp-resprate');
    const o2sat       = _dpFloatOrNull('dp-o2sat');
    const sbp         = _dpFloatOrNull('dp-sbp');
    const dbp         = _dpFloatOrNull('dp-dbp');
    const acuity      = _dpFloatOrNull('dp-acuity');

    setDpFormError('');
    if (isNaN(subjectId) || subjectId < 1) { setDpFormError('Subject ID must be a positive integer.'); return; }
    if (dpFormMode === 'add' && (isNaN(stayId) || stayId < 1)) { setDpFormError('Stay ID must be a positive integer.'); return; }
    // Vital sign range validation (mirrors backend rules)
    if (temperature !== null && (temperature < 26 || temperature > 46))   { setDpFormError('Temperature must be between 26 and 46 °C.'); return; }
    if (heartrate   !== null && (heartrate   < 20 || heartrate   > 300))  { setDpFormError('Heart rate must be between 20 and 300 bpm.'); return; }
    if (resprate    !== null && (resprate    < 4  || resprate    > 100))  { setDpFormError('Resp. rate must be between 4 and 100 breaths/min.'); return; }
    if (o2sat       !== null && (o2sat       < 0  || o2sat       > 100))  { setDpFormError('O₂ saturation must be between 0 and 100 %.'); return; }
    if (sbp         !== null && (sbp         < 40 || sbp         > 300))  { setDpFormError('SBP must be between 40 and 300 mmHg.'); return; }
    if (dbp         !== null && (dbp         < 20 || dbp         > 200))  { setDpFormError('DBP must be between 20 and 200 mmHg.'); return; }
    if (acuity      !== null && (acuity      < 1  || acuity      > 5))    { setDpFormError('Acuity must be between 1 and 5.'); return; }

    const ageRaw = document.getElementById('form-dp-age').value.trim();
    const payload = {
        subject_id:          subjectId,
        name:                document.getElementById('form-dp-name').value.trim()   || null,
        gender:              document.getElementById('form-dp-gender').value        || null,
        // Send age as integer or null
        age:                 ageRaw === '' ? null : parseInt(ageRaw),
        arrival_time:        document.getElementById('form-dp-arrival-time').value.trim()        || null,
        departure_time:      document.getElementById('form-dp-departure-time').value.trim()      || null,
        bed_occupation_time: document.getElementById('form-dp-bed-occupation-time').value.trim() || null,
        temperature,
        heartrate,
        resprate,
        o2sat,
        sbp,
        dbp,
        pain:                document.getElementById('form-dp-pain').value.trim() || null,
        acuity,
        chiefcomplaint:      document.getElementById('form-dp-chiefcomplaint').value.trim() || null
    };
    // stay_id is only included in the add payload (it is immutable on edit)
    if (dpFormMode === 'add') payload.stay_id = stayId;

    const btn = document.getElementById('save-dp-btn');
    btn.disabled = true; btn.textContent = 'Saving…';

    try {
        const url    = dpFormMode === 'add'
            ? 'http://localhost:8090/api/data/daily-patients/add'
            : 'http://localhost:8090/api/data/daily-patients/modify/' + dpCurrentStayId;
        const method = dpFormMode === 'add' ? 'POST' : 'PUT';
        const response = await fetch(url, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        const result   = await response.json();
        if (!response.ok) { setDpFormError(parseApiError(result.detail) || 'Error ' + response.status); return; }
        closeDpFormModal();
        showMessage(result.message, 'success');
        notifyDataChange('patient', result.message);
        loadDailyPatientsSettings();
    } catch (error) {
        setDpFormError('Network error: ' + error.message);
    } finally {
        btn.disabled = false; btn.textContent = 'Save';
    }
}

// ── Delete ─────────────────────────────────────────────────────────────────────

/**
 * @description Stores the stay_id to delete and shows the delete confirmation modal.
 * @param {number} stayId - The stay_id to delete.
 * @returns {void}
 */
function confirmDeleteDp(stayId) {
    dpDeleteId = stayId;
    document.getElementById('delete-dp-label').textContent = 'Stay ID ' + stayId;
    document.getElementById('dp-delete-modal').style.display = 'block';
}

/**
 * @description Closes the delete confirmation modal and clears the pending ID.
 * @returns {void}
 */
function closeDpDeleteModal() {
    document.getElementById('dp-delete-modal').style.display = 'none';
    dpDeleteId = null;
}

/**
 * @description Issues a DELETE request for the queued stay_id.  On success,
 *   fires the patient data-change event and reloads the table.
 * @returns {Promise<void>}
 */
async function deleteDp() {
    if (!dpDeleteId) return;
    const btn = document.getElementById('delete-dp-confirm-btn');
    btn.disabled = true; btn.textContent = 'Deleting…';
    try {
        const response = await fetch('http://localhost:8090/api/data/daily-patients/delete/' + dpDeleteId, { method: 'DELETE' });
        const result   = await response.json();
        if (!response.ok) throw new Error(result.detail || 'HTTP ' + response.status);
        closeDpDeleteModal();
        showMessage(result.message, 'success');
        notifyDataChange('patient', result.message);
        loadDailyPatientsSettings();
    } catch (error) {
        showMessage('Error: ' + error.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = 'Delete';
    }
}

// ── Auto-refresh via data-change bus ──────────────────────────────────────────
// Auto-refresh the table whenever any data change event fires and the
// daily-patients settings tab is currently visible.
onDataChange(function() {
    if (document.querySelector('.settings-tab[data-tab="daily-patients"]')?.classList.contains('active') &&
        document.getElementById('settings')?.classList.contains('active')) {
        loadDailyPatientsSettings();
    }
});
