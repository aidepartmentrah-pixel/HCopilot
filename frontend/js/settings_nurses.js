/**
 * settings_nurses.js
 *
 * Settings → Nurses sub-tab.
 * Manages full CRUD for Nurses.csv via the /api/staff/nurses/* endpoints.
 *
 * Mirrors the structure of settings_doctors.js but adds a role field.
 * Nurse roles:
 *   PN  — Practical Nurse
 *   RN  — Registered Nurse (required by the OR scheduler in strict mode)
 *   Bed_Admission — handles bed intake; not counted as a clinical nurse
 *
 * Absent toggle: marks a nurse absent so the OR scheduler and Scheduling
 * section exclude them from staff pools until re-marked as present.
 *
 * Global state:
 *   nurseFormMode  — 'add' | 'edit'
 *   nurseCurrentId — nurse_id being edited (null when adding)
 *   nurseDeleteId  — nurse_id queued for deletion
 *   allNursesData  — full unfiltered list from the API
 *   _nurseShifts   — cached shift list refreshed on each modal open
 *   _nurseGroups   — cached group list refreshed on each modal open
 */

// 'add' | 'edit'
let nurseFormMode = 'add';
// ID of the nurse being edited (null when adding)
let nurseCurrentId = null;
// ID queued for deletion
let nurseDeleteId = null;
// Full unfiltered list; filtered in memory on search/filter
let allNursesData = [];

// Cached shift and group lists — refreshed each time the form opens
let _nurseShifts = [];
let _nurseGroups = [];

// Display labels and CSS classes for each nurse role
const ROLE_LABELS  = { PN: 'PN', RN: 'RN', Bed_Admission: 'Bed Admission' };
const ROLE_CLASSES = { PN: 's-role-pn', RN: 's-role-rn', Bed_Admission: 's-role-ba' };

// ── Delegated click handler for table action buttons ──────────────────────────
document.addEventListener('click', function(e) {
    const editBtn = e.target.closest('[data-action="edit-nurse"]');
    const delBtn  = e.target.closest('[data-action="delete-nurse"]');
    if (editBtn) {
        openEditNurseModal(
            parseInt(editBtn.dataset.id),
            editBtn.dataset.role,
            editBtn.dataset.shift,
            editBtn.dataset.group,
            editBtn.dataset.patientnb || null,
            editBtn.dataset.availtime || null,
            editBtn.dataset.name || null
        );
    }
    if (delBtn) {
        confirmDeleteNurse(parseInt(delBtn.dataset.id), delBtn.dataset.role);
    }
});

// Clicking the modal backdrop closes the modal
window.addEventListener('click', function(e) {
    if (e.target === document.getElementById('nurse-form-modal'))  closeNurseFormModal();
    if (e.target === document.getElementById('nurse-delete-modal')) closeNurseDeleteModal();
});

// ── Shift icon helper ──────────────────────────────────────────────────────────

/**
 * @description Returns an emoji icon matching a shift name string.
 * @param {string} name - Shift name (e.g. "Morning", "Night").
 * @returns {string} Emoji character.
 */
function _nurseShiftIcon(name) {
    const n = (name || '').toLowerCase();
    if (n.includes('morning')) return '☀️';
    if (n.includes('evening')) return '🌇';
    if (n.includes('night'))   return '🌙';
    if (n.includes('day'))     return '🌤️';
    return '🕐';
}

// ── Load shift/group lists for the nurse form ──────────────────────────────────

/**
 * @description Fetches the current shifts and groups from the API, then renders
 *   the toggle-button rows inside the nurse form modal.  Also refreshes the
 *   filter bar dropdowns.  Gracefully degrades if the fetch fails.
 * @param {string|null} currentShift - Shift name to pre-select (null = first available).
 * @param {number|null} currentGroup - Group ID to pre-select (null = first available).
 * @returns {Promise<void>}
 */
async function _loadShiftsGroupsForNurseForm(currentShift, currentGroup) {
    try {
        const [sRes, gRes] = await Promise.all([
            fetch('/api/staff/shifts/list'),
            fetch('/api/staff/groups/list')
        ]);
        _nurseShifts = (await sRes.json()).shifts || [];
        _nurseGroups = (await gRes.json()).groups || [];
    } catch (_) {
        _nurseShifts = [];
        _nurseGroups = [];
    }

    // Build shift toggle buttons
    const sc = document.getElementById('nurse-shift-toggle-group');
    sc.innerHTML = '';
    if (!_nurseShifts.length) {
        sc.innerHTML = '<span class="form-loading-hint">No shifts configured</span>';
    } else {
        _nurseShifts.forEach(s => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'shift-toggle-btn';
            btn.dataset.val = s.name;
            btn.innerHTML = `<span class="st-dot"></span>${_nurseShiftIcon(s.name)} ${s.name}`;
            btn.onclick = () => selectNurseShift(s.name);
            sc.appendChild(btn);
        });
        // Pre-select the provided shift, or fall back to the first option
        selectNurseShift(currentShift || _nurseShifts[0].name);
    }

    // Build group toggle buttons
    const gc = document.getElementById('nurse-group-toggle-group');
    gc.innerHTML = '';
    if (!_nurseGroups.length) {
        gc.innerHTML = '<span class="form-loading-hint">No groups configured</span>';
    } else {
        _nurseGroups.forEach(g => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'group-toggle-btn';
            btn.dataset.val = g.name;
            btn.innerHTML = `<span class="st-dot"></span>${g.name}`;
            btn.onclick = () => selectNurseGroup(g.name);
            gc.appendChild(btn);
        });
        selectNurseGroup(currentGroup || _nurseGroups[0].name);
    }

    _populateNurseFilterDropdowns();
}

/**
 * @description Rebuilds the shift and group <select> elements in the nurses
 *   filter bar using the cached arrays.  Preserves any currently selected value.
 * @returns {void}
 */
function _populateNurseFilterDropdowns() {
    const shiftSel = document.getElementById('n-filter-shift');
    const groupSel = document.getElementById('n-filter-group');
    if (!shiftSel || !groupSel) return;
    // Snapshot current selections before clearing options
    const sv = shiftSel.value, gv = groupSel.value;
    shiftSel.innerHTML = '<option value="">All Shifts</option>';
    _nurseShifts.forEach(s => {
        shiftSel.innerHTML += `<option value="${s.name}">${_nurseShiftIcon(s.name)} ${s.name}</option>`;
    });
    shiftSel.value = sv;
    groupSel.innerHTML = '<option value="">All Groups</option>';
    _nurseGroups.forEach(g => {
        groupSel.innerHTML += `<option value="${g.name}">${g.name}</option>`;
    });
    groupSel.value = gv;
}

// ── Load / filter / render ─────────────────────────────────────────────────────

/**
 * @description Entry point called when the Nurses settings tab is activated.
 *   Fetches nurse list, stats, and shift/group reference data in parallel, then
 *   populates the stats bar and renders the table.
 * @returns {Promise<void>}
 */
async function loadNursesSettings() {
    const container = document.getElementById('settings-nurses-container');
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading nurses...</div>';
    document.getElementById('n-stats-bar').style.display = 'none';
    document.getElementById('n-filter-bar').style.display = 'none';

    try {
        const [listRes, statsRes, sRes, gRes] = await Promise.all([
            fetch('/api/staff/nurses/list'),
            fetch('/api/staff/nurses/stats'),
            fetch('/api/staff/shifts/list'),
            fetch('/api/staff/groups/list')
        ]);
        const listData  = await listRes.json();
        const statsData = await statsRes.json();
        _nurseShifts = (await sRes.json()).shifts || [];
        _nurseGroups = (await gRes.json()).groups || [];

        if (!listRes.ok)  throw new Error(listData.detail  || 'HTTP ' + listRes.status);
        if (!statsRes.ok) throw new Error(statsData.detail || 'HTTP ' + statsRes.status);

        allNursesData = listData.nurses;

        if (allNursesData.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-icon">👩‍⚕️</div><h3>No Nurses Found</h3><p>Click "Add Nurse" to get started.</p></div>';
            return;
        }

        // Populate stat chips (PN, RN, Bed Admission counts, plus shift/group breakdowns)
        document.getElementById('n-stat-total').textContent   = statsData.total;
        document.getElementById('n-stat-pn').textContent      = statsData.pn;
        document.getElementById('n-stat-rn').textContent      = statsData.rn;
        document.getElementById('n-stat-ba').textContent      = statsData.bed_admission;
        document.getElementById('n-stat-morning').textContent = statsData.morning;
        document.getElementById('n-stat-night').textContent   = statsData.night;
        document.getElementById('n-stat-g1').textContent      = statsData.group1;
        document.getElementById('n-stat-g2').textContent      = statsData.group2;
        document.getElementById('n-stats-bar').style.display  = 'flex';

        // Reset all filter controls
        document.getElementById('n-search').value         = '';
        document.getElementById('n-filter-role').value    = '';
        document.getElementById('n-filter-absent').value  = '';
        document.getElementById('n-filter-bar').style.display = 'flex';
        _populateNurseFilterDropdowns();
        document.getElementById('n-filter-shift').value   = '';
        document.getElementById('n-filter-group').value   = '';

        renderNursesTable(allNursesData);
    } catch (error) {
        container.innerHTML = '<div class="error-state"><div class="error-icon">❌</div><h3>Error Loading Nurses</h3><p>' + error.message + '</p></div>';
    }
}

/**
 * @description Reads all active filter inputs and re-renders the nurses table
 *   with only the matching rows.  All filtering is client-side against
 *   allNursesData.
 * @returns {void}
 */
function filterNurses() {
    const search  = document.getElementById('n-search').value.toLowerCase().trim();
    const role    = document.getElementById('n-filter-role').value;
    const shift   = document.getElementById('n-filter-shift').value;
    const group   = document.getElementById('n-filter-group').value;
    const absentF = document.getElementById('n-filter-absent').value;
    const filtered = allNursesData.filter(n =>
        (!search || String(n.id).includes(search) || (n.name && n.name.toLowerCase().includes(search)))
        && (!role    || n.role === role)
        && (!shift   || n.shift === shift)
        && (!group   || n.group === group)
        && (!absentF
            || (absentF === 'absent'  &&  n.absent)
            || (absentF === 'present' && !n.absent))
    );
    renderNursesTable(filtered);
}

/**
 * @description Resolves a group_id to its human-readable group name.
 * @param {number} groupId - The group_id to look up.
 * @returns {string} Group name or fallback "Group N".
 */
function _nurseGroupLabel(groupId) {
    const g = _nurseGroups.find(g => g.group_id === groupId);
    return g ? g.name : 'Group ' + groupId;
}

/**
 * @description Renders the nurses HTML table with role, shift, group badges,
 *   and action buttons.  Absent rows are visually dimmed.
 * @param {Array<Object>} nurses - Array of nurse objects from the API/filter.
 * @returns {void}
 */
function renderNursesTable(nurses) {
    const container = document.getElementById('settings-nurses-container');
    const countEl   = document.getElementById('n-visible-count');
    if (countEl) countEl.textContent = nurses.length + ' record' + (nurses.length !== 1 ? 's' : '');

    if (nurses.length === 0) {
        container.innerHTML = '<div class="s-no-results"><div class="s-no-results-icon">🔍</div><p>No nurses match your filters.</p></div>';
        return;
    }

    const rows = nurses.map(n => {
        // Look up the CSS class for this nurse's role from the ROLE_CLASSES map
        const roleClass  = ROLE_CLASSES[n.role] || '';
        const groupIdx   = _nurseGroups.findIndex(g => g.name === n.group);
        const groupClass = groupIdx === 0 ? 's-group-1' : 's-group-2';
        const patientCell = n.patientNB != null
            ? '<span class="s-info-pill s-patient-pill">🧑 ' + n.patientNB + '</span>'
            : '<span class="s-null-dash">–</span>';
        const timeCell = n.availabilityTimeStart != null
            ? '<span class="s-info-pill s-time-pill">🕐 ' + n.availabilityTimeStart + '</span>'
            : '<span class="s-null-dash">–</span>';
        const nameCell    = n.name ? n.name : '<span class="s-null-dash">–</span>';
        const absentBadge = n.absent ? '<span class="s-absent-badge">🔴 Absent</span>' : '';
        const absentBtnLabel = n.absent ? '✅ Mark Present' : '🔴 Mark Absent';
        const rowClass = n.absent ? ' class="s-row-absent"' : '';
        return `<tr${rowClass}>
            <td class="s-td-id">${n.id}</td>
            <td>${nameCell} ${absentBadge}</td>
            <td><span class="s-role-badge ${roleClass}">${ROLE_LABELS[n.role] || n.role}</span></td>
            <td><span class="s-role-badge s-shift-custom">${_nurseShiftIcon(n.shift)} ${n.shift}</span></td>
            <td><span class="s-role-badge ${groupClass}">${n.group}</span></td>
            <td>${patientCell}</td>
            <td>${timeCell}</td>
            <td class="s-td-actions">
                <button class="s-action-btn s-edit-btn" data-action="edit-nurse"
                    data-id="${n.id}" data-role="${n.role}"
                    data-shift="${n.shift}" data-group="${n.group}"
                    data-patientnb="${n.patientNB != null ? n.patientNB : ''}"
                    data-availtime="${n.availabilityTimeStart != null ? n.availabilityTimeStart : ''}"
                    data-name="${n.name != null ? n.name.replace(/"/g, '&quot;') : ''}">✏️ Edit</button>
                <button class="s-action-btn ${n.absent ? 's-present-btn' : 's-absent-btn'}"
                    onclick="toggleNurseAbsent(${n.id})">${absentBtnLabel}</button>
                <button class="s-action-btn s-del-btn" data-action="delete-nurse"
                    data-id="${n.id}" data-role="${n.role}">🗑️ Delete</button>
            </td>
        </tr>`;
    }).join('');

    container.innerHTML =
        '<div class="s-table-wrap"><table class="s-table">' +
        '<thead><tr><th style="width:55px">ID</th><th>Name</th><th>Role</th><th>Shift</th><th>Group</th><th>Patient NB</th><th>Avail. Time</th><th style="width:230px">Actions</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
        '</table></div>' +
        '<div class="s-table-footer">' + nurses.length + ' records shown' +
        (nurses.length < allNursesData.length ? ' <span class="s-filter-hint">(filtered from ' + allNursesData.length + ' total)</span>' : '') +
        '</div>';
}

// ── Absent toggle ──────────────────────────────────────────────────────────────

/**
 * @description Toggles the absent flag for a nurse via PUT.
 *   Fires the staff data-change event so Scheduling/Simulation can re-filter.
 * @param {number} id - Nurse ID to toggle.
 * @returns {Promise<void>}
 */
async function toggleNurseAbsent(id) {
    try {
        const res  = await fetch('/api/staff/nurses/toggle-absent/' + id, { method: 'PUT' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'HTTP ' + res.status);
        showMessage(data.absent ? 'Nurse marked absent' : 'Nurse marked present', 'success');
        notifyDataChange('staff', 'absent toggled');
        loadNursesSettings();
    } catch (e) {
        showMessage('Error: ' + e.message, 'error');
    }
}

// ── Form selectors ─────────────────────────────────────────────────────────────

/**
 * @description Selects a nurse role by updating the hidden input and toggling
 *   the active CSS class on role toggle buttons.
 * @param {string} val - "PN" | "RN" | "Bed_Admission"
 * @returns {void}
 */
function selectNurseRole(val) {
    document.getElementById('form-nurse-role').value = val;
    document.querySelectorAll('#nurse-form-modal .role-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === val);
    });
}

/**
 * @description Selects a shift in the nurse form, updating the hidden input and
 *   the active state of all shift toggle buttons.
 * @param {string} val - Shift name.
 * @returns {void}
 */
function selectNurseShift(val) {
    document.getElementById('form-nurse-shift').value = val;
    document.querySelectorAll('#nurse-shift-toggle-group .shift-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === val);
    });
}

/**
 * @description Selects a rotation group in the nurse form.
 *   Uses integer comparison because data-val attributes are strings.
 * @param {number|string} val - Group ID.
 * @returns {void}
 */
function selectNurseGroup(val) {
    document.getElementById('form-nurse-group').value = val;
    document.querySelectorAll('#nurse-group-toggle-group .group-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === String(val));
    });
}

/**
 * @description Shows or hides the inline form error element in the nurse form modal.
 * @param {string} msg - Error text, or empty string to hide.
 * @returns {void}
 */
function setNurseFormError(msg) {
    const el = document.getElementById('nurse-form-error');
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
}

// ── Modal open/close ──────────────────────────────────────────────────────────

/**
 * @description Opens the nurse form modal in "add" mode with blank fields.
 *   Defaults to RN role.
 * @returns {void}
 */
function openAddNurseModal() {
    nurseFormMode = 'add';
    nurseCurrentId = null;
    document.getElementById('nurse-form-title').textContent = 'Add Nurse';
    document.getElementById('form-nurse-name').value = '';
    document.getElementById('form-nurse-patient-nb').value = '';
    document.getElementById('form-nurse-avail-time').value = '';
    setNurseFormError('');
    selectNurseRole('RN');
    document.getElementById('nurse-form-modal').style.display = 'block';
    _loadShiftsGroupsForNurseForm(null, null);
}

/**
 * @description Opens the nurse form modal in "edit" mode with fields pre-filled
 *   from the selected row's data-* attributes.
 * @param {number}      id        - Nurse ID being edited.
 * @param {string}      role      - Current role ("PN" | "RN" | "Bed_Admission").
 * @param {string}      shift     - Current shift name.
 * @param {number}      group     - Current group_id.
 * @param {string|null} patientNB - Patient count, or null.
 * @param {string|null} availTime - Availability time, or null.
 * @param {string|null} name      - Nurse name, or null.
 * @returns {void}
 */
function openEditNurseModal(id, role, shift, group, patientNB, availTime, name) {
    nurseFormMode = 'edit';
    nurseCurrentId = id;
    document.getElementById('nurse-form-title').textContent = 'Edit Nurse #' + id;
    document.getElementById('form-nurse-name').value = name != null ? name : '';
    document.getElementById('form-nurse-patient-nb').value = patientNB != null ? patientNB : '';
    document.getElementById('form-nurse-avail-time').value = availTime != null ? availTime : '';
    setNurseFormError('');
    selectNurseRole(role);
    document.getElementById('nurse-form-modal').style.display = 'block';
    _loadShiftsGroupsForNurseForm(shift, group);
}

/**
 * @description Closes the nurse add/edit form modal.
 * @returns {void}
 */
function closeNurseFormModal() {
    document.getElementById('nurse-form-modal').style.display = 'none';
}

// ── Save / delete ──────────────────────────────────────────────────────────────

/**
 * @description Validates the form, then POSTs (add) or PUTs (edit) the nurse
 *   payload to the API.  On success, reloads the table and refreshes the
 *   Home dashboard Nurses managed card.
 * @returns {Promise<void>}
 */
async function saveNurseForm() {
    const role      = document.getElementById('form-nurse-role').value;
    const shift     = document.getElementById('form-nurse-shift').value;
    const group     = document.getElementById('form-nurse-group').value;
    const name      = document.getElementById('form-nurse-name').value.trim() || null;
    const patientNB = document.getElementById('form-nurse-patient-nb').value.trim() || null;
    const availTime = document.getElementById('form-nurse-avail-time').value.trim() || null;

    if (!shift)  { setNurseFormError('Please select a shift.'); return; }
    if (!group)  { setNurseFormError('Please select a group.'); return; }
    setNurseFormError('');

    const payload = { role, shift, group, name, patientNB, availabilityTimeStart: availTime };
    const btn = document.getElementById('save-nurse-btn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
        const url    = nurseFormMode === 'add'
            ? '/api/staff/nurses/add'
            : '/api/staff/nurses/modify/' + nurseCurrentId;
        const method = nurseFormMode === 'add' ? 'POST' : 'PUT';
        const response = await fetch(url, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        const result   = await response.json();
        if (!response.ok) { setNurseFormError(parseApiError(result.detail) || 'Error ' + response.status); return; }
        closeNurseFormModal();
        showMessage(result.message, 'success');
        notifyDataChange('staff', result.message);
        loadNursesSettings();
        // Refresh the Nurses count chip on the Home dashboard managed card
        refreshManagedCard('Nurses');
    } catch (error) {
        setNurseFormError('Network error: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save';
    }
}

/**
 * @description Stores the target nurse_id and role label, then shows the delete
 *   confirmation modal with a human-readable description.
 * @param {number} id   - Nurse ID to delete.
 * @param {string} role - Nurse role (used for the confirmation label).
 * @returns {void}
 */
function confirmDeleteNurse(id, role) {
    nurseDeleteId = id;
    document.getElementById('delete-nurse-label').textContent =
        (ROLE_LABELS[role] || role) + ' #' + id;
    document.getElementById('nurse-delete-modal').style.display = 'block';
}

/**
 * @description Closes the delete confirmation modal and clears the pending ID.
 * @returns {void}
 */
function closeNurseDeleteModal() {
    document.getElementById('nurse-delete-modal').style.display = 'none';
    nurseDeleteId = null;
}

/**
 * @description Issues a DELETE request for the queued nurse_id.  On success,
 *   reloads the table and refreshes the Home dashboard Nurses card.
 * @returns {Promise<void>}
 */
async function deleteNurse() {
    if (!nurseDeleteId) return;
    const btn = document.getElementById('delete-nurse-confirm-btn');
    btn.disabled = true;
    btn.textContent = 'Deleting…';
    try {
        const response = await fetch('/api/staff/nurses/delete/' + nurseDeleteId, { method: 'DELETE' });
        const result   = await response.json();
        if (!response.ok) throw new Error(result.detail || 'HTTP ' + response.status);
        closeNurseDeleteModal();
        showMessage(result.message, 'success');
        notifyDataChange('staff', result.message);
        loadNursesSettings();
        refreshManagedCard('Nurses');
    } catch (error) {
        showMessage('Error: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Delete';
    }
}

// Auto-refresh the nurses table when any data-change event fires and this tab is visible.
onDataChange(function() {
    if (document.querySelector('.settings-tab[data-tab="nurses"]')?.classList.contains('active') &&
        document.getElementById('settings')?.classList.contains('active')) {
        loadNursesSettings();
    }
});
