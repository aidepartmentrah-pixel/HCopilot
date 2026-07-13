// Settings → Groups tab: CRUD for work-day groups stored in Groups.csv.
// A group defines which days of the week a staff member works (e.g. Mon–Wed–Fri).
// Each doctor/nurse belongs to exactly one group; deleting a group does NOT
// automatically update staff records — a warning is shown before deletion.

const API_GROUPS = '/api/staff/groups';
// Short labels used to render day chips in the table (0 = Monday)
const DAY_SHORT  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_FULL   = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

let allGroupsData = [];
let groupFormMode = 'add';
let groupCurrentId = null;

window.addEventListener('click', function(e) {
    if (e.target === document.getElementById('group-form-modal'))   closeGroupFormModal();
    if (e.target === document.getElementById('group-delete-modal')) closeGroupDeleteModal();
});

async function loadGroupsSettings() {
    const container = document.getElementById('settings-groups-container');
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading groups...</div>';
    try {
        const res  = await fetch(API_GROUPS + '/list');
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'HTTP ' + res.status);
        allGroupsData = data.groups;
        renderGroupsTable(allGroupsData);
    } catch (e) {
        container.innerHTML = '<div class="error-state"><div class="error-icon">❌</div><h3>Error</h3><p>' + e.message + '</p></div>';
    }
}

// Render the groups table. Each row shows the group's active days as
// short-name chips (Mon, Tue, …) derived from the comma-separated day
// index string stored in the CSV.
function renderGroupsTable(groups) {
    const container = document.getElementById('settings-groups-container');
    if (!groups.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><h3>No Groups Defined</h3><p>Click "Add Group" to create one.</p></div>';
        return;
    }
    const rows = groups.map(g => {
        const dayNums = g.days.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d));
        const dayChips = dayNums.map(d =>
            `<span class="s-day-chip">${DAY_SHORT[d] ?? d}</span>`
        ).join('');
        return `<tr>
            <td class="s-td-id">${g.group_id}</td>
            <td><strong>${g.name}</strong></td>
            <td><div class="s-day-chips">${dayChips}</div></td>
            <td class="s-td-actions">
                <button class="s-action-btn s-edit-btn" onclick="openEditGroupModal(${g.group_id},'${g.name.replace(/'/g,"\\'")}','${g.days}')">✏️ Edit</button>
                <button class="s-action-btn s-del-btn" onclick="confirmDeleteGroup(${g.group_id},'${g.name.replace(/'/g,"\\'")}')">🗑️ Delete</button>
            </td>
        </tr>`;
    }).join('');
    container.innerHTML =
        '<div class="s-table-wrap"><table class="s-table">' +
        '<thead><tr><th style="width:55px">ID</th><th>Name</th><th>Days on Duty</th><th style="width:160px">Actions</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
}

function _resetGroupPicker() {
    document.querySelectorAll('#group-day-picker input[type=checkbox]').forEach(cb => cb.checked = false);
}

function openAddGroupModal() {
    groupFormMode = 'add';
    groupCurrentId = null;
    document.getElementById('group-form-title').textContent = 'Add Group';
    document.getElementById('group-id-row').style.display = 'none';
    document.getElementById('form-group-id').value   = '';
    document.getElementById('form-group-name').value = '';
    _resetGroupPicker();
    _setGroupError('');
    document.getElementById('group-form-modal').style.display = 'block';
    document.getElementById('form-group-name').focus();
}

function openEditGroupModal(id, name, days) {
    groupFormMode = 'edit';
    groupCurrentId = id;
    document.getElementById('group-form-title').textContent = 'Edit Group #' + id;
    document.getElementById('group-id-row').style.display = 'block';
    document.getElementById('form-group-id').value   = id;
    document.getElementById('form-group-name').value = name;
    _resetGroupPicker();
    const selectedDays = days.split(',').map(d => d.trim());
    selectedDays.forEach(d => {
        const cb = document.querySelector(`#group-day-picker input[value="${d}"]`);
        if (cb) cb.checked = true;
    });
    _setGroupError('');
    document.getElementById('group-form-modal').style.display = 'block';
}

function closeGroupFormModal() {
    document.getElementById('group-form-modal').style.display = 'none';
}

function _setGroupError(msg) {
    const el = document.getElementById('group-form-error');
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
}

async function saveGroupForm() {
    const name = document.getElementById('form-group-name').value.trim();
    const checked = Array.from(document.querySelectorAll('#group-day-picker input:checked')).map(cb => cb.value);

    if (!name)          { _setGroupError('Group name is required.'); return; }
    if (!checked.length){ _setGroupError('Select at least one day.'); return; }

    const days = checked.join(',');
    const body = { name, days };
    if (groupFormMode === 'edit') {
        const newId = parseInt(document.getElementById('form-group-id').value);
        if (isNaN(newId) || newId < 1) { _setGroupError('ID must be a positive integer.'); return; }
        if (newId !== groupCurrentId) body.new_id = newId;
    }

    const btn = document.getElementById('save-group-btn');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
        const url    = groupFormMode === 'add' ? API_GROUPS + '/add' : API_GROUPS + '/modify/' + groupCurrentId;
        const method = groupFormMode === 'add' ? 'POST' : 'PUT';
        const res    = await fetch(url, { method, headers: {'Content-Type':'application/json'},
                                          body: JSON.stringify(body) });
        const data   = await res.json();
        if (!res.ok) { _setGroupError(data.detail || 'Error ' + res.status); return; }
        closeGroupFormModal();
        showMessage(data.message, 'success');
        loadGroupsSettings();
    } catch (e) {
        _setGroupError('Network error: ' + e.message);
    } finally {
        btn.disabled = false; btn.textContent = 'Save';
    }
}

let _groupDeletePendingId = null;

function confirmDeleteGroup(id, name) {
    _groupDeletePendingId = id;
    document.getElementById('delete-group-label').textContent = `"${name}" (ID ${id})`;
    document.getElementById('group-delete-modal').style.display = 'block';
}

function closeGroupDeleteModal() {
    _groupDeletePendingId = null;
    document.getElementById('group-delete-modal').style.display = 'none';
}

async function doDeleteGroup() {
    const id = _groupDeletePendingId;
    if (!id) return;
    closeGroupDeleteModal();
    try {
        const res  = await fetch(API_GROUPS + '/delete/' + id, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'HTTP ' + res.status);
        showMessage(data.message, 'success');
        loadGroupsSettings();
    } catch (e) {
        showMessage('Error: ' + e.message, 'error');
    }
}
