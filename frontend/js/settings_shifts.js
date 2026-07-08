// Settings → Shifts tab: CRUD for Shifts.csv.
// A shift defines a named time window (start_hour – end_hour, 0–23).
// The OR scheduler and Scheduling filter bar use the current wall-clock time
// to auto-detect which shift is active unless the user overrides it.
// Overnight shifts are detected automatically: end_hour < start_hour means
// the shift crosses midnight (e.g. Night: 22 → 6).

const API_SHIFTS = 'http://localhost:8090/api/staff/shifts';

let allShiftsData = [];
// 'add' | 'edit'
let shiftFormMode = 'add';
// ID of the shift being edited (null when adding)
let shiftCurrentId = null;

window.addEventListener('click', function(e) {
    if (e.target === document.getElementById('shift-form-modal'))   closeShiftFormModal();
    if (e.target === document.getElementById('shift-delete-modal')) closeShiftDeleteModal();
});

async function loadShiftsSettings() {
    const container = document.getElementById('settings-shifts-container');
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading shifts...</div>';
    try {
        const res  = await fetch(API_SHIFTS + '/list');
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'HTTP ' + res.status);
        allShiftsData = data.shifts;
        renderShiftsTable(allShiftsData);
    } catch (e) {
        container.innerHTML = '<div class="error-state"><div class="error-icon">❌</div><h3>Error</h3><p>' + e.message + '</p></div>';
    }
}

// Format an integer hour (0–23) as "HH:00" for display.
function _fmtHour(h) {
    return String(h).padStart(2, '0') + ':00';
}

function renderShiftsTable(shifts) {
    const container = document.getElementById('settings-shifts-container');
    if (!shifts.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏱️</div><h3>No Shifts Defined</h3><p>Click "Add Shift" to create one.</p></div>';
        return;
    }
    const rows = shifts.map(s => {
        const overnight = s.end_hour < s.start_hour;
        const label = overnight
            ? `${_fmtHour(s.start_hour)} → ${_fmtHour(s.end_hour)} <span class="s-overnight-tag">(overnight)</span>`
            : `${_fmtHour(s.start_hour)} → ${_fmtHour(s.end_hour)}`;
        return `<tr>
            <td class="s-td-id">${s.shift_id}</td>
            <td><strong>${s.name}</strong></td>
            <td>${label}</td>
            <td class="s-td-actions">
                <button class="s-action-btn s-edit-btn" onclick="openEditShiftModal(${s.shift_id},'${s.name.replace(/'/g,"\\'")}',${s.start_hour},${s.end_hour})">✏️ Edit</button>
                <button class="s-action-btn s-del-btn" onclick="confirmDeleteShift(${s.shift_id},'${s.name.replace(/'/g,"\\'")}')">🗑️ Delete</button>
            </td>
        </tr>`;
    }).join('');
    container.innerHTML =
        '<div class="s-table-wrap"><table class="s-table">' +
        '<thead><tr><th style="width:55px">ID</th><th>Name</th><th>Hours</th><th style="width:160px">Actions</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>' +
        '<p class="shifts-hint">💡 When hours overlap, the first matching shift wins. Overnight shifts are detected automatically when end hour &lt; start hour.</p>';
}

function openAddShiftModal() {
    shiftFormMode = 'add';
    shiftCurrentId = null;
    document.getElementById('shift-form-title').textContent = 'Add Shift';
    document.getElementById('shift-id-row').style.display = 'none';
    document.getElementById('form-shift-id').value   = '';
    document.getElementById('form-shift-name').value = '';
    document.getElementById('form-shift-start').value = '';
    document.getElementById('form-shift-end').value = '';
    _setShiftError('');
    document.getElementById('shift-form-modal').style.display = 'block';
    document.getElementById('form-shift-name').focus();
}

function openEditShiftModal(id, name, start, end) {
    shiftFormMode = 'edit';
    shiftCurrentId = id;
    document.getElementById('shift-form-title').textContent = 'Edit Shift #' + id;
    document.getElementById('shift-id-row').style.display = 'block';
    document.getElementById('form-shift-id').value   = id;
    document.getElementById('form-shift-name').value  = name;
    document.getElementById('form-shift-start').value = start;
    document.getElementById('form-shift-end').value   = end;
    _setShiftError('');
    document.getElementById('shift-form-modal').style.display = 'block';
}

function closeShiftFormModal() {
    document.getElementById('shift-form-modal').style.display = 'none';
}

function _setShiftError(msg) {
    const el = document.getElementById('shift-form-error');
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
}

async function saveShiftForm() {
    const name  = document.getElementById('form-shift-name').value.trim();
    const start = parseInt(document.getElementById('form-shift-start').value);
    const end   = parseInt(document.getElementById('form-shift-end').value);

    if (!name) { _setShiftError('Shift name is required.'); return; }
    if (isNaN(start) || start < 0 || start > 23) { _setShiftError('Start hour must be 0–23.'); return; }
    if (isNaN(end)   || end   < 0 || end   > 23) { _setShiftError('End hour must be 0–23.');   return; }

    const body = { name, start_hour: start, end_hour: end };
    if (shiftFormMode === 'edit') {
        const newId = parseInt(document.getElementById('form-shift-id').value);
        if (isNaN(newId) || newId < 1) { _setShiftError('ID must be a positive integer.'); return; }
        if (newId !== shiftCurrentId) body.new_id = newId;
    }

    const btn = document.getElementById('save-shift-btn');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
        const url    = shiftFormMode === 'add' ? API_SHIFTS + '/add' : API_SHIFTS + '/modify/' + shiftCurrentId;
        const method = shiftFormMode === 'add' ? 'POST' : 'PUT';
        const res    = await fetch(url, { method, headers: {'Content-Type':'application/json'},
                                          body: JSON.stringify(body) });
        const data   = await res.json();
        if (!res.ok) { _setShiftError(data.detail || 'Error ' + res.status); return; }
        closeShiftFormModal();
        showMessage(data.message, 'success');
        loadShiftsSettings();
    } catch (e) {
        _setShiftError('Network error: ' + e.message);
    } finally {
        btn.disabled = false; btn.textContent = 'Save';
    }
}

let _shiftDeletePendingId = null;

function confirmDeleteShift(id, name) {
    _shiftDeletePendingId = id;
    document.getElementById('delete-shift-label').textContent = `"${name}" (ID ${id})`;
    document.getElementById('shift-delete-modal').style.display = 'block';
}

function closeShiftDeleteModal() {
    _shiftDeletePendingId = null;
    document.getElementById('shift-delete-modal').style.display = 'none';
}

async function doDeleteShift() {
    const id = _shiftDeletePendingId;
    if (!id) return;
    closeShiftDeleteModal();
    try {
        const res  = await fetch(API_SHIFTS + '/delete/' + id, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'HTTP ' + res.status);
        showMessage(data.message, 'success');
        loadShiftsSettings();
    } catch (e) {
        showMessage('Error: ' + e.message, 'error');
    }
}
