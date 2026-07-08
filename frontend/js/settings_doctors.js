/**
 * settings_doctors.js
 *
 * Settings → Doctors sub-tab.
 * Manages full CRUD for Doctors.csv via the /api/staff/doctors/* endpoints.
 *
 * Doctors and interns share this table; the intern_or_not column distinguishes
 * them ("doctor" | "intern").  The OR scheduler in simulation.js gives
 * preference to senior doctors for critical patients (acuity 1/2).
 *
 * Absent toggle: marks a doctor absent so the OR scheduler and Scheduling
 * section exclude them from candidate pools until toggled back to present.
 * patientNb tracks the current number of assigned patients and is
 * auto-decremented by the server on discharge.
 *
 * Global state:
 *   doctorFormMode   — 'add' | 'edit'
 *   doctorCurrentId  — doctor_id being edited (null when adding)
 *   doctorDeleteId   — doctor_id queued for deletion
 *   allDoctorsData   — full unfiltered list from the API
 *   _doctorShifts    — cached shift list refreshed on each modal open
 *   _doctorGroups    — cached group list refreshed on each modal open
 */

// 'add' | 'edit'
let doctorFormMode = 'add';
// ID of the doctor being edited (null when adding)
let doctorCurrentId = null;
// ID queued for deletion
let doctorDeleteId = null;
// Full unfiltered list; filtered in memory on search/filter
let allDoctorsData = [];

// Cached shift/group configs (refreshed each time the modal opens)
let _doctorShifts = [];
let _doctorGroups = [];

// ── Delegated click handler for table action buttons ──────────────────────────
// Using a single document listener instead of inline onclick attributes keeps
// the rendered HTML cleaner and works for rows added after DOMContentLoaded.
document.addEventListener('click', function(e) {
    const editBtn = e.target.closest('[data-action="edit-doctor"]');
    const delBtn  = e.target.closest('[data-action="delete-doctor"]');
    if (editBtn) {
        openEditDoctorModal(
            parseInt(editBtn.dataset.id),
            editBtn.dataset.type,
            editBtn.dataset.shift,
            editBtn.dataset.group,
            editBtn.dataset.patientnb || null,
            editBtn.dataset.availtime || null,
            editBtn.dataset.name || null
        );
    }
    if (delBtn) {
        confirmDeleteDoctor(parseInt(delBtn.dataset.id), delBtn.dataset.type);
    }
});

// Clicking the modal backdrop (not its content) closes the modal
window.addEventListener('click', function(e) {
    if (e.target === document.getElementById('doctor-form-modal'))  closeDoctorFormModal();
    if (e.target === document.getElementById('doctor-delete-modal')) closeDoctorDeleteModal();
});

// ── Shift/group icons ──────────────────────────────────────────────────────────

/**
 * @description Returns an emoji icon matching a shift name string.
 *   Supports morning, evening, night, and day; unknown shifts get a clock icon.
 * @param {string} name - Shift name (e.g. "Morning", "Night").
 * @returns {string} Emoji character.
 */
function _shiftIcon(name) {
    const n = (name || '').toLowerCase();
    if (n.includes('morning')) return '☀️';
    if (n.includes('evening')) return '🌇';
    if (n.includes('night'))   return '🌙';
    if (n.includes('day'))     return '🌤️';
    return '🕐';
}

// ── Load shift/group lists and populate form toggle buttons ────────────────────

/**
 * @description Fetches the current shifts and groups from the API, then renders
 *   the toggle-button rows inside the doctor form modal.  Also refreshes the
 *   filter bar dropdowns with the fresh data.  If the fetch fails, the toggle
 *   groups show a "no data" hint rather than crashing.
 * @param {string|null} currentShift - Shift name to pre-select (null selects first).
 * @param {number|null} currentGroup - Group ID to pre-select (null selects first).
 * @returns {Promise<void>}
 */
async function _loadShiftsGroupsForDoctorForm(currentShift, currentGroup) {
    try {
        const [sRes, gRes] = await Promise.all([
            fetch('http://localhost:8090/api/staff/shifts/list'),
            fetch('http://localhost:8090/api/staff/groups/list')
        ]);
        _doctorShifts = (await sRes.json()).shifts || [];
        _doctorGroups = (await gRes.json()).groups || [];
    } catch (_) {
        // Gracefully degrade — the form still works, just without dynamic shift/group options
        _doctorShifts = [];
        _doctorGroups = [];
    }

    // Populate shift toggle buttons
    const sc = document.getElementById('doctor-shift-toggle-group');
    sc.innerHTML = '';
    if (!_doctorShifts.length) {
        sc.innerHTML = '<span class="form-loading-hint">No shifts configured</span>';
    } else {
        _doctorShifts.forEach((s, i) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'shift-toggle-btn';
            btn.dataset.val = s.name;
            btn.innerHTML = `<span class="st-dot"></span>${_shiftIcon(s.name)} ${s.name}`;
            btn.onclick = () => selectDoctorShift(s.name);
            sc.appendChild(btn);
        });
        // Pre-select either the provided shift or the first available shift
        const initial = currentShift || _doctorShifts[0].name;
        selectDoctorShift(initial);
    }

    // Populate group toggle buttons
    const gc = document.getElementById('doctor-group-toggle-group');
    gc.innerHTML = '';
    if (!_doctorGroups.length) {
        gc.innerHTML = '<span class="form-loading-hint">No groups configured</span>';
    } else {
        _doctorGroups.forEach((g, i) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'group-toggle-btn';
            btn.dataset.val = g.name;
            btn.innerHTML = `<span class="st-dot"></span>${g.name}`;
            btn.onclick = () => selectDoctorGroup(g.name);
            gc.appendChild(btn);
        });
        const initial = currentGroup || _doctorGroups[0].name;
        selectDoctorGroup(initial);
    }

    // Refresh shift/group filter dropdowns while we have fresh data
    _populateDoctorFilterDropdowns();
}

/**
 * @description Rebuilds the shift and group <select> elements in the filter bar
 *   using the cached _doctorShifts and _doctorGroups arrays.  Preserves any
 *   currently selected value so an active filter is not cleared on refresh.
 * @returns {void}
 */
function _populateDoctorFilterDropdowns() {
    const shiftSel = document.getElementById('d-filter-shift');
    const groupSel = document.getElementById('d-filter-group');
    if (!shiftSel || !groupSel) return;
    // Remember the current selection before clearing options
    const sv = shiftSel.value, gv = groupSel.value;
    shiftSel.innerHTML = '<option value="">All Shifts</option>';
    _doctorShifts.forEach(s => {
        shiftSel.innerHTML += `<option value="${s.name}">${_shiftIcon(s.name)} ${s.name}</option>`;
    });
    shiftSel.value = sv;
    groupSel.innerHTML = '<option value="">All Groups</option>';
    _doctorGroups.forEach(g => {
        groupSel.innerHTML += `<option value="${g.name}">${g.name}</option>`;
    });
    groupSel.value = gv;
}

// ── Load / filter / render ─────────────────────────────────────────────────────

/**
 * @description Entry point called when the Doctors settings tab is activated.
 *   Fetches the doctor list, stats, and shift/group reference data in parallel,
 *   populates the stats bar and filter dropdowns, and renders the table.
 * @returns {Promise<void>}
 */
async function loadDoctorsSettings() {
    const container = document.getElementById('settings-doctors-container');
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading doctors...</div>';
    document.getElementById('d-stats-bar').style.display = 'none';
    document.getElementById('d-filter-bar').style.display = 'none';

    try {
        // Fetch all four endpoints in parallel to minimise total wait time
        const [listRes, statsRes, sRes, gRes] = await Promise.all([
            fetch('http://localhost:8090/api/staff/doctors/list'),
            fetch('http://localhost:8090/api/staff/doctors/stats'),
            fetch('http://localhost:8090/api/staff/shifts/list'),
            fetch('http://localhost:8090/api/staff/groups/list')
        ]);
        const listData  = await listRes.json();
        const statsData = await statsRes.json();
        _doctorShifts = (await sRes.json()).shifts || [];
        _doctorGroups = (await gRes.json()).groups || [];

        if (!listRes.ok)  throw new Error(listData.detail  || 'HTTP ' + listRes.status);
        if (!statsRes.ok) throw new Error(statsData.detail || 'HTTP ' + statsRes.status);

        allDoctorsData = listData.doctors;

        if (allDoctorsData.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-icon">👨‍⚕️</div><h3>No Doctors Found</h3><p>Click "Add Doctor" to get started.</p></div>';
            return;
        }

        // Populate the stat chips in the stats bar
        document.getElementById('d-stat-total').textContent   = statsData.total;
        document.getElementById('d-stat-doctors').textContent = statsData.doctors;
        document.getElementById('d-stat-interns').textContent = statsData.interns;
        document.getElementById('d-stat-morning').textContent = statsData.morning;
        document.getElementById('d-stat-night').textContent   = statsData.night;
        document.getElementById('d-stat-g1').textContent      = statsData.group1;
        document.getElementById('d-stat-g2').textContent      = statsData.group2;
        document.getElementById('d-stats-bar').style.display  = 'flex';

        // Reset all filter controls before populating dropdowns
        document.getElementById('d-search').value         = '';
        document.getElementById('d-filter-type').value    = '';
        document.getElementById('d-filter-absent').value  = '';
        document.getElementById('d-filter-bar').style.display = 'flex';
        _populateDoctorFilterDropdowns();
        document.getElementById('d-filter-shift').value   = '';
        document.getElementById('d-filter-group').value   = '';

        renderDoctorsTable(allDoctorsData);
    } catch (error) {
        container.innerHTML = '<div class="error-state"><div class="error-icon">❌</div><h3>Error Loading Doctors</h3><p>' + error.message + '</p></div>';
    }
}

/**
 * @description Reads all active filter inputs, applies them to allDoctorsData in
 *   memory, and calls renderDoctorsTable() with the resulting subset.
 *   No API call is made — all filtering is client-side.
 * @returns {void}
 */
function filterDoctors() {
    const search  = document.getElementById('d-search').value.toLowerCase().trim();
    const type    = document.getElementById('d-filter-type').value;
    const shift   = document.getElementById('d-filter-shift').value;
    const group   = document.getElementById('d-filter-group').value;
    const absentF = document.getElementById('d-filter-absent').value;
    const filtered = allDoctorsData.filter(d =>
        // Name or ID text search
        (!search || String(d.id).includes(search) || (d.name && d.name.toLowerCase().includes(search)))
        && (!type   || d.intern_or_not === type)
        && (!shift  || d.shift === shift)
        && (!group  || d.work_days === group)
        && (!absentF
            || (absentF === 'absent'  &&  d.absent)
            || (absentF === 'present' && !d.absent))
    );
    renderDoctorsTable(filtered);
}

/**
 * @description Resolves a group_id to its human-readable group name.
 *   Falls back to "Group N" if the group is not in the cached list.
 * @param {number} groupId - The group_id to look up.
 * @returns {string} Group name string.
 */
function _groupLabel(groupId) {
    const g = _doctorGroups.find(g => g.group_id === groupId);
    return g ? g.name : 'Group ' + groupId;
}

/**
 * @description Renders the doctors HTML table.  Each row includes a conditional
 *   "Absent/Present" toggle button and Edit/Delete action buttons.
 *   Absent rows receive a dimmed CSS class to visually distinguish them.
 * @param {Array<Object>} doctors - Array of doctor objects (may be a filtered subset).
 * @returns {void}
 */
function renderDoctorsTable(doctors) {
    const container = document.getElementById('settings-doctors-container');
    const countEl   = document.getElementById('d-visible-count');
    if (countEl) countEl.textContent = doctors.length + ' record' + (doctors.length !== 1 ? 's' : '');

    if (doctors.length === 0) {
        container.innerHTML = '<div class="s-no-results"><div class="s-no-results-icon">🔍</div><p>No doctors match your filters.</p></div>';
        return;
    }

    const rows = doctors.map(d => {
        const typeClass  = d.intern_or_not === 'doctor' ? 's-type-doctor' : 's-type-intern';
        const shiftClass = 's-shift-custom';
        const groupIdx   = _doctorGroups.findIndex(g => g.name === d.work_days);
        const groupClass = groupIdx === 0 ? 's-group-1' : 's-group-2';
        // patientNb and availabilityTimeStart are optional — show a dash when absent
        const patientCell = d.patientNb != null
            ? '<span class="s-info-pill s-patient-pill">🧑 ' + d.patientNb + '</span>'
            : '<span class="s-null-dash">–</span>';
        const timeCell = d.availabilityTimeStart != null
            ? '<span class="s-info-pill s-time-pill">🕐 ' + d.availabilityTimeStart + '</span>'
            : '<span class="s-null-dash">–</span>';
        const nameCell = d.name ? d.name : '<span class="s-null-dash">–</span>';
        const absentBadge = d.absent ? '<span class="s-absent-badge">🔴 Absent</span>' : '';
        // Toggle button label flips depending on current absent state
        const absentBtnLabel = d.absent ? '✅ Mark Present' : '🔴 Mark Absent';
        const rowClass = d.absent ? ' class="s-row-absent"' : '';
        return `<tr${rowClass}>
            <td class="s-td-id">${d.id}</td>
            <td>${nameCell} ${absentBadge}</td>
            <td><span class="s-role-badge ${typeClass}">${d.intern_or_not === 'doctor' ? '🩺 Doctor' : '🎓 Intern'}</span></td>
            <td><span class="s-role-badge ${shiftClass}">${_shiftIcon(d.shift)} ${d.shift}</span></td>
            <td><span class="s-role-badge ${groupClass}">${d.work_days}</span></td>
            <td>${patientCell}</td>
            <td>${timeCell}</td>
            <td class="s-td-actions">
                <button class="s-action-btn s-edit-btn" data-action="edit-doctor"
                    data-id="${d.id}" data-type="${d.intern_or_not}"
                    data-shift="${d.shift}" data-group="${d.work_days}"
                    data-patientnb="${d.patientNb != null ? d.patientNb : ''}"
                    data-availtime="${d.availabilityTimeStart != null ? d.availabilityTimeStart : ''}"
                    data-name="${d.name != null ? d.name.replace(/"/g, '&quot;') : ''}">✏️ Edit</button>
                <button class="s-action-btn ${d.absent ? 's-present-btn' : 's-absent-btn'}"
                    onclick="toggleDoctorAbsent(${d.id})">${absentBtnLabel}</button>
                <button class="s-action-btn s-del-btn" data-action="delete-doctor"
                    data-id="${d.id}" data-type="${d.intern_or_not}">🗑️ Delete</button>
            </td>
        </tr>`;
    }).join('');

    container.innerHTML =
        '<div class="s-table-wrap"><table class="s-table">' +
        '<thead><tr><th style="width:55px">ID</th><th>Name</th><th>Type</th><th>Shift</th><th>Group</th><th>Patient Nb</th><th>Avail. Time</th><th style="width:230px">Actions</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
        '</table></div>' +
        '<div class="s-table-footer">' + doctors.length + ' records shown' +
        (doctors.length < allDoctorsData.length ? ' <span class="s-filter-hint">(filtered from ' + allDoctorsData.length + ' total)</span>' : '') +
        '</div>';
}

// ── Absent toggle ──────────────────────────────────────────────────────────────

/**
 * @description Toggles the absent flag for a doctor via PUT.
 *   The server flips the value and returns the new state in data.absent.
 *   On success the table is reloaded and the staff data-change event is fired
 *   so the Scheduling and Simulation sections can re-filter their pools.
 * @param {number} id - Doctor ID to toggle.
 * @returns {Promise<void>}
 */
async function toggleDoctorAbsent(id) {
    try {
        const res  = await fetch('http://localhost:8090/api/staff/doctors/toggle-absent/' + id, { method: 'PUT' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'HTTP ' + res.status);
        showMessage(data.absent ? 'Doctor marked absent' : 'Doctor marked present', 'success');
        notifyDataChange('staff', 'absent toggled');
        loadDoctorsSettings();
    } catch (e) {
        showMessage('Error: ' + e.message, 'error');
    }
}

// ── Form selectors ─────────────────────────────────────────────────────────────
// Each selector updates a hidden <input> that holds the chosen value and toggles
// the 'active' class on the corresponding visual button.

/**
 * @description Selects a doctor type ("doctor" or "intern") by updating the
 *   hidden input and toggling the active CSS class on the type toggle buttons.
 * @param {string} val - "doctor" | "intern"
 * @returns {void}
 */
function selectDoctorType(val) {
    document.getElementById('form-doctor-type').value = val;
    document.querySelectorAll('#doctor-form-modal .type-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === val);
    });
}

/**
 * @description Selects a shift by name, updating the hidden input and the
 *   active state of all shift toggle buttons in the doctor form.
 * @param {string} val - Shift name (e.g. "Morning").
 * @returns {void}
 */
function selectDoctorShift(val) {
    document.getElementById('form-doctor-shift').value = val;
    document.querySelectorAll('#doctor-shift-toggle-group .shift-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === val);
    });
}

/**
 * @description Selects a rotation group by group_id, updating the hidden input
 *   and the active state of all group toggle buttons in the doctor form.
 *   Integer comparison is used because data-val attributes are strings.
 * @param {number|string} val - Group ID.
 * @returns {void}
 */
function selectDoctorGroup(val) {
    document.getElementById('form-doctor-group').value = val;
    document.querySelectorAll('#doctor-group-toggle-group .group-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === String(val));
    });
}

/**
 * @description Shows or hides the inline form error element in the doctor form modal.
 * @param {string} msg - Error text, or empty string to hide.
 * @returns {void}
 */
function setDoctorFormError(msg) {
    const el = document.getElementById('doctor-form-error');
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
}

// ── Modal open/close ──────────────────────────────────────────────────────────

/**
 * @description Opens the doctor form modal in "add" mode with blank fields.
 *   Fetches the latest shifts and groups so the toggle rows are always current.
 * @returns {void}
 */
function openAddDoctorModal() {
    doctorFormMode = 'add';
    doctorCurrentId = null;
    document.getElementById('doctor-form-title').textContent = 'Add Doctor / Intern';
    document.getElementById('form-doctor-name').value = '';
    document.getElementById('form-doctor-patient-nb').value = '';
    document.getElementById('form-doctor-avail-time').value = '';
    setDoctorFormError('');
    selectDoctorType('doctor');
    document.getElementById('doctor-form-modal').style.display = 'block';
    // Load shifts/groups asynchronously after the modal is visible
    _loadShiftsGroupsForDoctorForm(null, null);
}

/**
 * @description Opens the doctor form modal in "edit" mode, pre-populating all
 *   fields with the values passed from the table row's data-* attributes.
 * @param {number}      id        - Doctor ID being edited.
 * @param {string}      type      - "doctor" | "intern"
 * @param {string}      shift     - Current shift name.
 * @param {number}      group     - Current group_id.
 * @param {string|null} patientNb - Current patient count, or null.
 * @param {string|null} availTime - Availability time string, or null.
 * @param {string|null} name      - Doctor name, or null.
 * @returns {void}
 */
function openEditDoctorModal(id, type, shift, group, patientNb, availTime, name) {
    doctorFormMode = 'edit';
    doctorCurrentId = id;
    document.getElementById('doctor-form-title').textContent = 'Edit Doctor #' + id;
    document.getElementById('form-doctor-name').value = name != null ? name : '';
    document.getElementById('form-doctor-patient-nb').value = patientNb != null ? patientNb : '';
    document.getElementById('form-doctor-avail-time').value = availTime != null ? availTime : '';
    setDoctorFormError('');
    selectDoctorType(type);
    document.getElementById('doctor-form-modal').style.display = 'block';
    // Pass the current shift/group so the correct toggle buttons are pre-selected
    _loadShiftsGroupsForDoctorForm(shift, group);
}

/**
 * @description Closes the doctor add/edit form modal.
 * @returns {void}
 */
function closeDoctorFormModal() {
    document.getElementById('doctor-form-modal').style.display = 'none';
}

// ── Save / delete ──────────────────────────────────────────────────────────────

/**
 * @description Reads all form values, validates required fields (shift and group),
 *   and sends a POST (add) or PUT (edit) request.  On success, reloads the table
 *   and refreshes the managed-card on the Home section.
 * @returns {Promise<void>}
 */
async function saveDoctorForm() {
    const type      = document.getElementById('form-doctor-type').value;
    const shift     = document.getElementById('form-doctor-shift').value;
    const workDays  = document.getElementById('form-doctor-group').value;
    const name      = document.getElementById('form-doctor-name').value.trim() || null;
    const patientNb = document.getElementById('form-doctor-patient-nb').value.trim() || null;
    const availTime = document.getElementById('form-doctor-avail-time').value.trim() || null;

    if (!shift)    { setDoctorFormError('Please select a shift.'); return; }
    if (!workDays) { setDoctorFormError('Please select a group.'); return; }
    setDoctorFormError('');

    const payload = { intern_or_not: type, shift, work_days: workDays, name, patientNb, availabilityTimeStart: availTime };
    const btn = document.getElementById('save-doctor-btn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
        const url    = doctorFormMode === 'add'
            ? 'http://localhost:8090/api/staff/doctors/add'
            : 'http://localhost:8090/api/staff/doctors/modify/' + doctorCurrentId;
        const method = doctorFormMode === 'add' ? 'POST' : 'PUT';
        const response = await fetch(url, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        const result   = await response.json();
        if (!response.ok) { setDoctorFormError(parseApiError(result.detail) || 'Error ' + response.status); return; }
        closeDoctorFormModal();
        showMessage(result.message, 'success');
        notifyDataChange('staff', result.message);
        loadDoctorsSettings();
        // Refresh the Doctors count chip on the Home dashboard managed card
        refreshManagedCard('Doctors');
    } catch (error) {
        setDoctorFormError('Network error: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save';
    }
}

/**
 * @description Stores the target doctor_id and type label, then shows the
 *   delete confirmation modal with a human-readable description.
 * @param {number} id   - Doctor ID to delete.
 * @param {string} type - "doctor" | "intern" (used for the confirmation label).
 * @returns {void}
 */
function confirmDeleteDoctor(id, type) {
    doctorDeleteId = id;
    document.getElementById('delete-doctor-label').textContent =
        (type === 'doctor' ? 'Doctor' : 'Intern') + ' #' + id;
    document.getElementById('doctor-delete-modal').style.display = 'block';
}

/**
 * @description Closes the delete confirmation modal and clears the pending ID.
 * @returns {void}
 */
function closeDoctorDeleteModal() {
    document.getElementById('doctor-delete-modal').style.display = 'none';
    doctorDeleteId = null;
}

/**
 * @description Issues a DELETE request for the queued doctor_id.  On success,
 *   reloads the table and refreshes the Home dashboard Doctors card.
 * @returns {Promise<void>}
 */
async function deleteDoctor() {
    if (!doctorDeleteId) return;
    const btn = document.getElementById('delete-doctor-confirm-btn');
    btn.disabled = true;
    btn.textContent = 'Deleting…';
    try {
        const response = await fetch('http://localhost:8090/api/staff/doctors/delete/' + doctorDeleteId, { method: 'DELETE' });
        const result   = await response.json();
        if (!response.ok) throw new Error(result.detail || 'HTTP ' + response.status);
        closeDoctorDeleteModal();
        showMessage(result.message, 'success');
        notifyDataChange('staff', result.message);
        loadDoctorsSettings();
        refreshManagedCard('Doctors');
    } catch (error) {
        showMessage('Error: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Delete';
    }
}

// ── Auto-refresh via data-change bus ──────────────────────────────────────────
// Reloads the doctors table whenever any data-change event fires AND the Doctors
// settings tab is currently the active, visible tab.  This keeps the list in sync
// if another tab (e.g. Relations) modifies staff-related data.
onDataChange(function() {
    if (document.querySelector('.settings-tab[data-tab="doctors"]')?.classList.contains('active') &&
        document.getElementById('settings')?.classList.contains('active')) {
        loadDoctorsSettings();
    }
});
