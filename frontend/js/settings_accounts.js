// Settings → Accounts tab: admin-only user management (Users.csv).
//
// Permissions model:
//   - Role "admin"  → full access to all sections, settings tabs, and statistics
//                     tabs, regardless of what is stored in those fields.
//   - Role "user"   → access limited to the comma-separated IDs in `sections`,
//                     `settings_tabs`, and `statistics_tabs`.
//
// The form renders checkboxes for every section defined in HCOPILOT_SECTIONS
// (auth.js).  Two sections have inline sub-pickers that appear when ticked:
//   - "Settings"    → HCOPILOT_SETTINGS_TABS sub-picker (grouped by category)
//   - "Statistics"  → HCOPILOT_STATISTICS_TABS sub-picker (Patients / Nurses / Doctors / Wards / Daily Analysis)
// All sub-tabs are auto-checked when the parent section is first enabled.
//
// The accounts table shows section chips, and — when applicable — separate rows
// for allowed settings tabs (⚙️) and allowed statistics tabs (📊).
//
// Passwords are SHA-256 hashed server-side; this form only sends plaintext
// when creating a new user or when the password field is explicitly filled
// (leave it blank on edit to keep the existing hash).
//
// If the current user edits their own record, the in-memory session is
// refreshed so nav access and badge update immediately without a re-login.
//
// Relies on HCOPILOT_SECTIONS, HCOPILOT_SETTINGS_TABS, HCOPILOT_STATISTICS_TABS,
// AUTH_API from auth.js.

let _accMode    = 'add';   // 'add' | 'edit'
let _accEditId  = null;
let _accUsers   = [];

// ── Load & render ─────────────────────────────────────────────────────────────

async function loadAccountsSettings() {
    const container = document.getElementById('acc-list-container');
    if (!container) return;

    if (!isAdmin()) {
        container.innerHTML = `<div class="acc-empty">⛔ Account management is restricted to administrators.</div>`;
        return;
    }

    container.innerHTML = '<div class="acc-empty">Loading…</div>';

    try {
        const res  = await fetch(`${AUTH_API}/users`);
        const data = await res.json();
        _accUsers  = data.users || [];
        _renderAccountsTable(container);
    } catch (err) {
        container.innerHTML = `<div class="acc-empty">Error loading users: ${err.message}</div>`;
    }
}

function _renderAccountsTable(container) {
    if (_accUsers.length === 0) {
        container.innerHTML = '<div class="acc-empty">No users found.</div>';
        return;
    }

    const rows = _accUsers.map(u => {
        const initials = (u.name || u.username).charAt(0).toUpperCase();
        const roleClass  = u.role === 'admin' ? 'role-admin' : 'role-user';
        const roleIcon   = u.role === 'admin' ? '🛡️' : '👤';
        const secChips   = _renderSectionChips(u);
        const tabChips   = _renderSettingsTabChips(u);
        const statsChips = _renderStatisticsTabChips(u);
        const me         = currentUser();
        const isSelf     = me && me.user_id === u.user_id;
        const selfNote   = isSelf ? ' <span style="font-size:10.5px;color:#6b7280">(you)</span>' : '';

        return `
        <tr>
            <td>
                <div style="display:flex;align-items:center;gap:10px">
                    <div class="acc-avatar ${roleClass}">${initials}</div>
                    <div>
                        <div style="font-weight:700">${_esc(u.name || '—')}</div>
                        <div style="font-size:11.5px;color:#6b7280">@${_esc(u.username)}${selfNote}</div>
                    </div>
                </div>
            </td>
            <td>
                <span class="acc-role-badge ${roleClass}">${roleIcon} ${u.role.charAt(0).toUpperCase() + u.role.slice(1)}</span>
            </td>
            <td>
                <div class="acc-sections-cell">${secChips}</div>
                ${tabChips   ? `<div class="acc-stabs-cell">${tabChips}</div>`   : ''}
                ${statsChips ? `<div class="acc-stabs-cell">${statsChips}</div>` : ''}
            </td>
            <td style="white-space:nowrap">
                <button class="acc-action-btn acc-edit-btn"
                        onclick="accOpenEditModal(${u.user_id})">✏️ Edit</button>
                <button class="acc-action-btn acc-del-btn"
                        onclick="accConfirmDelete(${u.user_id})"
                        ${isSelf ? 'disabled title="Cannot delete your own account"' : ''}>🗑️</button>
            </td>
        </tr>
        <tr id="acc-del-row-${u.user_id}" style="display:none">
            <td colspan="4">
                <div class="acc-delete-confirm">
                    <p>Delete user <strong>@${_esc(u.username)}</strong>? This cannot be undone.</p>
                    <div class="acc-delete-confirm-btns">
                        <button class="acc-action-btn acc-edit-btn"
                                onclick="document.getElementById('acc-del-row-${u.user_id}').style.display='none'">Cancel</button>
                        <button class="acc-action-btn acc-del-btn"
                                onclick="accDeleteUser(${u.user_id})">Yes, Delete</button>
                    </div>
                </div>
            </td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <div class="acc-table-wrap">
            <table class="acc-table">
                <thead>
                    <tr>
                        <th>User</th>
                        <th>Role</th>
                        <th>Sections</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

function _renderSectionChips(u) {
    if (u.role === 'admin') {
        return '<span class="acc-sec-chip all">⭐ All Sections</span>';
    }
    const ids = (u.sections || '').split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) return '<span style="color:#9ca3af;font-size:12px">None</span>';
    return ids.map(id => {
        const sec = HCOPILOT_SECTIONS.find(s => s.id === id);
        return `<span class="acc-sec-chip">${sec ? sec.label : id}</span>`;
    }).join('');
}

function _renderSettingsTabChips(u) {
    // Only show if the user has (or can have) settings access
    const sections = (u.sections || '').split(',').map(s => s.trim());
    const hasSettings = u.role === 'admin' || sections.includes('settings');
    if (!hasSettings) return '';

    if (u.role === 'admin') {
        return '<span class="acc-stab-chip all">⚙️ All Settings Tabs</span>';
    }

    const ids = (u.settings_tabs || '').split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) return '<span class="acc-stab-chip-label">⚙️ Settings tabs: <em style="color:#9ca3af">none</em></span>';

    const chips = ids.map(id => {
        const tab = HCOPILOT_SETTINGS_TABS.find(t => t.id === id);
        return `<span class="acc-stab-chip">${tab ? tab.label : id}</span>`;
    }).join('');
    return `<span class="acc-stab-chip-label">⚙️ Settings tabs:</span>${chips}`;
}

function _renderStatisticsTabChips(u) {
    const sections = (u.sections || '').split(',').map(s => s.trim());
    const hasStatistics = u.role === 'admin' || sections.includes('statistics');
    if (!hasStatistics) return '';

    if (u.role === 'admin') {
        return '<span class="acc-stab-chip all">📊 All Statistics Tabs</span>';
    }

    const ids = (u.statistics_tabs || '').split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) return '<span class="acc-stab-chip-label">📊 Statistics tabs: <em style="color:#9ca3af">none</em></span>';

    const chips = ids.map(id => {
        const tab = HCOPILOT_STATISTICS_TABS.find(t => t.id === id);
        return `<span class="acc-stab-chip">${tab ? tab.label : id}</span>`;
    }).join('');
    return `<span class="acc-stab-chip-label">📊 Statistics tabs:</span>${chips}`;
}

function _esc(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function accOpenAddModal() {
    _accMode   = 'add';
    _accEditId = null;
    _openAccModal({ username: '', name: '', role: 'user', sections: '' }, 'Add User');
}

function accOpenEditModal(userId) {
    const u = _accUsers.find(x => x.user_id === userId);
    if (!u) return;
    _accMode   = 'edit';
    _accEditId = userId;
    _openAccModal(u, `Edit — @${u.username}`);
}

function _openAccModal(u, title) {
    document.getElementById('acc-modal-title').textContent = title;

    // Fields
    document.getElementById('acc-field-username').value = u.username || '';
    document.getElementById('acc-field-name').value     = u.name     || '';
    document.getElementById('acc-field-password').value = '';

    const pwNote = document.getElementById('acc-pw-note');
    pwNote.style.display = _accMode === 'edit' ? '' : 'none';

    // Role
    _accSetRole(u.role || 'user');

    // Sections + settings tabs + statistics tabs sub-pickers
    _accRenderSections(u.sections || '', u.settings_tabs || '', u.statistics_tabs || '');

    // Error
    const err = document.getElementById('acc-form-error');
    err.style.display = 'none';

    document.getElementById('acc-modal-overlay').style.display = 'flex';
}

function accCloseModal() {
    document.getElementById('acc-modal-overlay').style.display = 'none';
}

// Role picker
function _accSetRole(role) {
    document.querySelectorAll('.acc-role-option').forEach(el => {
        el.classList.remove('selected-admin', 'selected-user');
        const input = el.querySelector('input[type="radio"]');
        input.checked = input.value === role;
        if (input.checked) {
            el.classList.add(role === 'admin' ? 'selected-admin' : 'selected-user');
        }
    });
    _accUpdateSectionsLock();
}

function accOnRoleChange(radio) {
    _accSetRole(radio.value);
}

// Section checkboxes + settings-tabs sub-picker
function _accRenderSections(sectionsStr, settingsTabsStr, statisticsTabsStr) {
    const checked          = sectionsStr.split(',').map(s => s.trim()).filter(Boolean);
    const checkedTabs      = (settingsTabsStr    || '').split(',').map(s => s.trim()).filter(Boolean);
    const checkedStatsTabs = (statisticsTabsStr  || '').split(',').map(s => s.trim()).filter(Boolean);
    const grid             = document.getElementById('acc-sections-grid');
    const settingsOn       = checked.includes('settings');
    const statisticsOn     = checked.includes('statistics');

    grid.innerHTML = HCOPILOT_SECTIONS.map(s => {
        if (s.id === 'settings') {
            // Inline sub-picker for settings tabs
            const tabsHtml = _accRenderSettingsTabsPicker(checkedTabs);
            return `
            <label class="acc-sec-check-item">
                <input type="checkbox" value="settings" id="acc-sec-settings-cb"
                       ${settingsOn ? 'checked' : ''}
                       onchange="_accOnSettingsToggle(this)">
                ${s.label}
            </label>
            <div id="acc-settings-tabs-picker" class="acc-settings-tabs-picker"
                 style="${settingsOn ? '' : 'display:none'}">
                ${tabsHtml}
            </div>`;
        }
        if (s.id === 'statistics') {
            // Inline sub-picker for the statistics tabs (Patients / Nurses / Doctors / Wards / Daily Analysis)
            const statsTabsHtml = _accRenderStatisticsTabsPicker(checkedStatsTabs);
            return `
            <label class="acc-sec-check-item">
                <input type="checkbox" value="statistics" id="acc-sec-statistics-cb"
                       ${statisticsOn ? 'checked' : ''}
                       onchange="_accOnStatisticsToggle(this)">
                ${s.label}
            </label>
            <div id="acc-statistics-tabs-picker" class="acc-settings-tabs-picker"
                 style="${statisticsOn ? '' : 'display:none'}">
                ${statsTabsHtml}
            </div>`;
        }
        return `
        <label class="acc-sec-check-item">
            <input type="checkbox" value="${s.id}"
                   ${checked.includes(s.id) ? 'checked' : ''}>
            ${s.label}
        </label>`;
    }).join('');

    _accUpdateSectionsLock();
}

function _accRenderSettingsTabsPicker(checkedTabs) {
    // Group tabs by their group label, render headers + checkboxes
    const groups = [];
    const seen   = {};
    HCOPILOT_SETTINGS_TABS.forEach(t => {
        const g = t.group || 'Other';
        if (!seen[g]) { seen[g] = true; groups.push(g); }
    });
    return groups.map(g => {
        const tabs = HCOPILOT_SETTINGS_TABS.filter(t => (t.group || 'Other') === g);
        const items = tabs.map(t => `
            <label class="acc-sec-check-item acc-stab-item">
                <input type="checkbox" value="${t.id}" class="acc-stab-cb"
                       ${checkedTabs.includes(t.id) ? 'checked' : ''}>
                ${t.label}
            </label>`).join('');
        return `<div class="acc-stab-group-label">${g}</div>${items}`;
    }).join('');
}

function _accOnSettingsToggle(cb) {
    const picker = document.getElementById('acc-settings-tabs-picker');
    if (!picker) return;
    picker.style.display = cb.checked ? '' : 'none';
    if (cb.checked) {
        // Auto-select all tabs when Settings is first enabled
        picker.querySelectorAll('.acc-stab-cb').forEach(inp => inp.checked = true);
    }
}

function _accRenderStatisticsTabsPicker(checkedTabs) {
    return HCOPILOT_STATISTICS_TABS.map(t => `
        <label class="acc-sec-check-item acc-stab-item">
            <input type="checkbox" value="${t.id}" class="acc-stats-tab-cb"
                   ${checkedTabs.includes(t.id) ? 'checked' : ''}>
            ${t.label}
        </label>`).join('');
}

function _accOnStatisticsToggle(cb) {
    const picker = document.getElementById('acc-statistics-tabs-picker');
    if (!picker) return;
    picker.style.display = cb.checked ? '' : 'none';
    if (cb.checked) {
        // Auto-select all statistics tabs when Statistics is first enabled
        picker.querySelectorAll('.acc-stats-tab-cb').forEach(inp => inp.checked = true);
    }
}

function _accUpdateSectionsLock() {
    const role     = _accGetRole();
    const isAdminR = role === 'admin';
    const allNote  = document.getElementById('acc-sec-all-note');
    if (allNote) allNote.style.display = isAdminR ? '' : 'none';

    // Top-level section checkboxes (direct <label> children of the grid)
    document.querySelectorAll('#acc-sections-grid > label.acc-sec-check-item').forEach(el => {
        el.classList.toggle('disabled-sec', isAdminR);
        const inp = el.querySelector('input');
        if (inp && isAdminR) inp.checked = true;
    });

    // Settings tabs sub-picker
    const settingsCb = document.getElementById('acc-sec-settings-cb');
    const picker     = document.getElementById('acc-settings-tabs-picker');
    if (picker) {
        const showPicker = isAdminR || (settingsCb && settingsCb.checked);
        picker.style.display = showPicker ? '' : 'none';
        picker.querySelectorAll('.acc-stab-item').forEach(el => {
            el.classList.toggle('disabled-sec', isAdminR);
            const inp = el.querySelector('input');
            if (inp && isAdminR) inp.checked = true;
        });
    }

    // Statistics tabs sub-picker
    const statisticsCb  = document.getElementById('acc-sec-statistics-cb');
    const statsPicker   = document.getElementById('acc-statistics-tabs-picker');
    if (statsPicker) {
        const showStatsPicker = isAdminR || (statisticsCb && statisticsCb.checked);
        statsPicker.style.display = showStatsPicker ? '' : 'none';
        statsPicker.querySelectorAll('.acc-stab-item').forEach(el => {
            el.classList.toggle('disabled-sec', isAdminR);
            const inp = el.querySelector('input');
            if (inp && isAdminR) inp.checked = true;
        });
    }
}

function _accGetRole() {
    const checked = document.querySelector('.acc-role-option input[type="radio"]:checked');
    return checked ? checked.value : 'user';
}

function _accGetSections() {
    const role = _accGetRole();
    if (role === 'admin') return HCOPILOT_SECTIONS.map(s => s.id).join(',');
    // Exclude sub-picker checkboxes (settings tabs + statistics tabs) from section list
    return Array.from(document.querySelectorAll('#acc-sections-grid input[type="checkbox"]:checked'))
                .filter(i => !i.classList.contains('acc-stab-cb') && !i.classList.contains('acc-stats-tab-cb'))
                .map(i => i.value)
                .join(',');
}

function _accGetSettingsTabs() {
    const role = _accGetRole();
    if (role === 'admin') return HCOPILOT_SETTINGS_TABS.map(t => t.id).join(',');
    const settingsCb = document.getElementById('acc-sec-settings-cb');
    if (!settingsCb || !settingsCb.checked) return '';
    return Array.from(document.querySelectorAll('.acc-stab-cb:checked'))
                .map(i => i.value)
                .join(',');
}

function _accGetStatisticsTabs() {
    const role = _accGetRole();
    if (role === 'admin') return HCOPILOT_STATISTICS_TABS.map(t => t.id).join(',');
    const statisticsCb = document.getElementById('acc-sec-statistics-cb');
    if (!statisticsCb || !statisticsCb.checked) return '';
    return Array.from(document.querySelectorAll('.acc-stats-tab-cb:checked'))
                .map(i => i.value)
                .join(',');
}

// ── Save ──────────────────────────────────────────────────────────────────────

async function accSaveUser() {
    const errEl    = document.getElementById('acc-form-error');
    const saveBtn  = document.getElementById('acc-save-btn');
    const username = document.getElementById('acc-field-username').value.trim();
    const name     = document.getElementById('acc-field-name').value.trim();
    const password = document.getElementById('acc-field-password').value;
    const role             = _accGetRole();
    const sections         = _accGetSections();
    const settings_tabs    = _accGetSettingsTabs();
    const statistics_tabs  = _accGetStatisticsTabs();

    errEl.style.display = 'none';

    if (!username) {
        errEl.textContent = 'Username is required.';
        errEl.style.display = '';
        return;
    }

    if (_accMode === 'add' && !password) {
        errEl.textContent = 'Password is required for new users.';
        errEl.style.display = '';
        return;
    }

    // Settings access requires at least one settings tab to be selected
    if (role !== 'admin') {
        const settingsCb = document.getElementById('acc-sec-settings-cb');
        if (settingsCb && settingsCb.checked) {
            const tabCount = document.querySelectorAll('.acc-stab-cb:checked').length;
            if (tabCount === 0) {
                errEl.textContent = 'Settings access requires at least one settings tab to be selected.';
                errEl.style.display = '';
                return;
            }
        }
        // Statistics access requires at least one statistics tab to be selected
        const statisticsCb = document.getElementById('acc-sec-statistics-cb');
        if (statisticsCb && statisticsCb.checked) {
            const statsTabCount = document.querySelectorAll('.acc-stats-tab-cb:checked').length;
            if (statsTabCount === 0) {
                errEl.textContent = 'Statistics access requires at least one statistics tab to be selected.';
                errEl.style.display = '';
                return;
            }
        }
    }

    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving…';

    try {
        const url    = _accMode === 'add'
            ? `${AUTH_API}/users`
            : `${AUTH_API}/users/${_accEditId}`;
        const method = _accMode === 'add' ? 'POST' : 'PUT';
        const body   = { username, name, role, sections, settings_tabs, statistics_tabs };
        if (password) body.password = password;

        const res  = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Save failed');

        accCloseModal();
        loadAccountsSettings();

        // If the current user edited their own record, refresh stored session
        const me = currentUser();
        if (me && _accEditId === me.user_id) {
            const refreshed = { ...me, username, name, role, sections, settings_tabs, statistics_tabs };
            localStorage.setItem(SESSION_KEY, JSON.stringify(refreshed));
            _updateBadge(refreshed);
        }

    } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = '';
    } finally {
        saveBtn.disabled    = false;
        saveBtn.textContent = 'Save';
    }
}

// ── Delete ────────────────────────────────────────────────────────────────────

function accConfirmDelete(userId) {
    // Toggle the inline confirm row
    const row = document.getElementById(`acc-del-row-${userId}`);
    if (row) row.style.display = row.style.display === 'none' ? '' : 'none';
}

async function accDeleteUser(userId) {
    try {
        const res  = await fetch(`${AUTH_API}/users/${userId}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Delete failed');
        loadAccountsSettings();
    } catch (err) {
        alert(`Error: ${err.message}`);
    }
}

// Close modal when clicking outside
window.addEventListener('click', e => {
    if (e.target === document.getElementById('acc-modal-overlay')) accCloseModal();
});
