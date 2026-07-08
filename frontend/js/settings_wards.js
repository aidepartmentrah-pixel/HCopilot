/**
 * settings_wards.js
 *
 * Settings → Wards sub-tab.
 * Manages full CRUD for Wards.csv via the /api/data/wards/* endpoints.
 *
 * A ward groups a set of beds under a department.  department_id is a
 * numeric foreign key; departments themselves are not managed in this app
 * (they are only referenced by ID).  Deleting a ward cascades on the server
 * to remove all ward_bed, ward_doctor, and ward_nurse relation rows for
 * that ward.
 *
 * Global state:
 *   wardFormMode   — tracks whether the form modal is in 'add' or 'edit' mode
 *   wardCurrentId  — the ward_id being edited (null when adding)
 *   wardDeleteId   — the ward_id queued for deletion
 *   allWardsData   — full unfiltered list fetched from the API; filtered in memory
 */

// 'add' | 'edit'
let wardFormMode = 'add';
// ID of the ward being edited (null when adding)
let wardCurrentId = null;
// ID queued for deletion
let wardDeleteId = null;
// Full unfiltered list; filtered in memory on search
let allWardsData = [];

// ── Modal backdrop click-to-close ──────────────────────────────────────────────
// Clicking the semi-transparent backdrop (the modal element itself, not its children)
// closes the corresponding modal without saving.
window.addEventListener('click', function(e) {
    if (e.target === document.getElementById('ward-form-modal'))   closeWardFormModal();
    if (e.target === document.getElementById('ward-delete-modal')) closeWardDeleteModal();
});

// ── Load ───────────────────────────────────────────────────────────────────────

/**
 * @description Fetches the wards list and stats from the API in parallel,
 *   populates the stats bar, resets the search filter, and renders the table.
 *   Shows a loading spinner while the request is in flight and an error state
 *   if the request fails.
 * @returns {Promise<void>}
 */
async function loadWardsSettings() {
    const container = document.getElementById('settings-wards-container');
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading wards...</div>';
    // Hide the stats bar and filter bar until data is ready
    document.getElementById('w-stats-bar').style.display  = 'none';
    document.getElementById('w-filter-bar').style.display = 'none';

    try {
        // Fetch the ward list and aggregate stats in a single round-trip
        const [listRes, statsRes] = await Promise.all([
            fetch('http://localhost:8090/api/data/wards/list'),
            fetch('http://localhost:8090/api/data/wards/stats')
        ]);
        const listData  = await listRes.json();
        const statsData = await statsRes.json();
        if (!listRes.ok)  throw new Error(listData.detail  || 'HTTP ' + listRes.status);
        if (!statsRes.ok) throw new Error(statsData.detail || 'HTTP ' + statsRes.status);

        allWardsData = listData.wards;

        if (allWardsData.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-icon">🏢</div><h3>No Wards Found</h3><p>Click "Add Ward" to get started.</p></div>';
            return;
        }

        // Populate the summary stat chips above the table
        document.getElementById('w-stat-total').textContent = statsData.total;
        document.getElementById('w-stat-beds').textContent  = statsData.assigned_beds;
        document.getElementById('w-stat-depts').textContent = statsData.departments;
        document.getElementById('w-stats-bar').style.display = 'flex';

        // Reset search input and reveal the filter bar
        document.getElementById('w-search').value = '';
        document.getElementById('w-filter-bar').style.display = 'flex';

        renderWardsTable(allWardsData);
    } catch (error) {
        container.innerHTML = '<div class="error-state"><div class="error-icon">❌</div><h3>Error Loading Wards</h3><p>' + error.message + '</p></div>';
    }
}

// ── Filter ─────────────────────────────────────────────────────────────────────

/**
 * @description Client-side filter triggered by the search input's oninput event.
 *   Matches the query against ward_name (case-insensitive) and ward_id, then
 *   re-renders the table with only the matching rows.
 * @returns {void}
 */
function filterWards() {
    const search = document.getElementById('w-search').value.toLowerCase().trim();
    const filtered = allWardsData.filter(w =>
        // Show all rows when the search box is empty; otherwise match on name or ID
        !search || w.ward_name.toLowerCase().includes(search) || String(w.ward_id).includes(search)
    );
    renderWardsTable(filtered);
}

// ── Render ─────────────────────────────────────────────────────────────────────

/**
 * @description Builds and injects the wards HTML table into the container element.
 *   Each row includes Edit and Delete action buttons whose data-* attributes carry
 *   the ward's properties so the click handler can open the correct modal without
 *   an extra API call.
 * @param {Array<Object>} wards - Array of ward objects from the API.
 * @returns {void}
 */
function renderWardsTable(wards) {
    const container = document.getElementById('settings-wards-container');
    const countEl   = document.getElementById('w-visible-count');
    // Update the visible-count chip in the filter bar
    if (countEl) countEl.textContent = wards.length + ' ward' + (wards.length !== 1 ? 's' : '');

    if (wards.length === 0) {
        container.innerHTML = '<div class="s-no-results"><div class="s-no-results-icon">🔍</div><p>No wards match your filters.</p></div>';
        return;
    }

    // Build each table row as an HTML string; data-* attributes are used by the
    // delegated click handler below to identify which ward was clicked.
    const rows = wards.map(w =>
        '<tr>' +
        '<td class="s-td-id">' + w.ward_id + '</td>' +
        '<td><span class="s-bed-num-pill">' + w.ward_name + '</span></td>' +
        '<td>' + w.assigned_beds + '</td>' +
        '<td>' + w.department_id + '</td>' +
        '<td class="s-td-actions">' +
            '<button class="s-action-btn s-edit-btn" data-action="edit-ward" ' +
                'data-id="' + w.ward_id + '" data-name="' + w.ward_name + '" ' +
                'data-dept="' + w.department_id + '">✏️ Edit</button>' +
            '<button class="s-action-btn s-del-btn" data-action="delete-ward" ' +
                'data-id="' + w.ward_id + '" data-name="' + w.ward_name + '">🗑️ Delete</button>' +
        '</td>' +
        '</tr>'
    ).join('');

    container.innerHTML =
        '<div class="s-table-wrap"><table class="s-table">' +
        '<thead><tr><th style="width:55px">ID</th><th>Ward Name</th><th>Assigned Beds</th><th>Dept ID</th><th style="width:170px">Actions</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
        '</table></div>' +
        // Footer shows total count and a "(filtered from N total)" hint when a search is active
        '<div class="s-table-footer">' + wards.length + ' wards shown' +
        (wards.length < allWardsData.length ? ' <span class="s-filter-hint">(filtered from ' + allWardsData.length + ' total)</span>' : '') +
        '</div>';
}

// ── Delegated click handler ────────────────────────────────────────────────────
// Single listener on document handles Edit and Delete buttons injected by
// renderWardsTable().  Using data-action keeps the button HTML declarative and
// avoids per-row event listener overhead.
document.addEventListener('click', function(e) {
    const editBtn = e.target.closest('[data-action="edit-ward"]');
    const delBtn  = e.target.closest('[data-action="delete-ward"]');
    if (editBtn) openEditWardModal(parseInt(editBtn.dataset.id), editBtn.dataset.name, parseInt(editBtn.dataset.dept));
    if (delBtn)  confirmDeleteWard(parseInt(delBtn.dataset.id), delBtn.dataset.name);
});

// ── Form validation helper ─────────────────────────────────────────────────────

/**
 * @description Shows or hides the inline form error message below the form fields.
 * @param {string} msg - Error text to display, or an empty string to hide the element.
 * @returns {void}
 */
function setWardFormError(msg) {
    const el = document.getElementById('ward-form-error');
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
}

// ── Modal open/close ───────────────────────────────────────────────────────────

/**
 * @description Opens the ward form modal in "add" mode with all fields cleared.
 *   Focuses the name field after a short delay to allow the modal animation to finish.
 * @returns {void}
 */
function openAddWardModal() {
    wardFormMode = 'add';
    wardCurrentId = null;
    document.getElementById('ward-form-title').textContent = 'Add Ward';
    document.getElementById('form-ward-name').value    = '';
    document.getElementById('form-ward-dept-id').value = '';
    setWardFormError('');
    document.getElementById('ward-form-modal').style.display = 'block';
    // Delay focus so the modal display transition does not interfere
    setTimeout(() => document.getElementById('form-ward-name').focus(), 100);
}

/**
 * @description Opens the ward form modal in "edit" mode, pre-populating the
 *   fields with the selected ward's current values.
 * @param {number} id     - ward_id of the ward to edit.
 * @param {string} name   - Current ward name.
 * @param {number} deptId - Current department_id.
 * @returns {void}
 */
function openEditWardModal(id, name, deptId) {
    wardFormMode = 'edit';
    wardCurrentId = id;
    document.getElementById('ward-form-title').textContent = 'Edit Ward #' + id;
    document.getElementById('form-ward-name').value    = name;
    document.getElementById('form-ward-dept-id').value = deptId;
    setWardFormError('');
    document.getElementById('ward-form-modal').style.display = 'block';
}

/**
 * @description Closes the ward add/edit form modal.
 * @returns {void}
 */
function closeWardFormModal() {
    document.getElementById('ward-form-modal').style.display = 'none';
}

// ── Save ───────────────────────────────────────────────────────────────────────

/**
 * @description Validates the form fields, then POSTs (add) or PUTs (edit) the
 *   ward payload to the API.  Disables the Save button while the request is
 *   in flight to prevent duplicate submissions.  On success, closes the modal,
 *   shows a toast, fires the data-change bus, and reloads the table.
 * @returns {Promise<void>}
 */
async function saveWardForm() {
    const wardName = document.getElementById('form-ward-name').value.trim();
    const deptId   = parseInt(document.getElementById('form-ward-dept-id').value);

    // Clear any previous error before re-validating
    setWardFormError('');
    if (!wardName)                    { setWardFormError('Ward name is required.'); return; }
    if (isNaN(deptId) || deptId < 1) { setWardFormError('Department ID must be a positive integer.'); return; }

    const payload = { ward_name: wardName, department_id: deptId };
    const btn = document.getElementById('save-ward-btn');
    btn.disabled = true; btn.textContent = 'Saving…';

    try {
        // Choose the correct URL and HTTP method based on the current form mode
        const url    = wardFormMode === 'add'
            ? 'http://localhost:8090/api/data/wards/add'
            : 'http://localhost:8090/api/data/wards/modify/' + wardCurrentId;
        const method = wardFormMode === 'add' ? 'POST' : 'PUT';
        const response = await fetch(url, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        const result   = await response.json();
        if (!response.ok) { setWardFormError(parseApiError(result.detail) || 'Error ' + response.status); return; }
        closeWardFormModal();
        showMessage(result.message, 'success');
        // Notify other sections (e.g. beds-display) that ward data has changed
        notifyDataChange('wards', result.message);
        loadWardsSettings();
    } catch (error) {
        setWardFormError('Network error: ' + error.message);
    } finally {
        // Always re-enable the button regardless of outcome
        btn.disabled = false; btn.textContent = 'Save';
    }
}

// ── Delete ─────────────────────────────────────────────────────────────────────

/**
 * @description Stores the target ward_id, populates the delete-confirm modal
 *   with the ward's human-readable label, and shows the modal.
 * @param {number} id   - ward_id to delete.
 * @param {string} name - Ward name shown in the confirmation message.
 * @returns {void}
 */
function confirmDeleteWard(id, name) {
    wardDeleteId = id;
    document.getElementById('delete-ward-label').textContent = name + ' (ID: ' + id + ')';
    document.getElementById('ward-delete-modal').style.display = 'block';
}

/**
 * @description Closes the delete confirmation modal and clears the pending ID.
 * @returns {void}
 */
function closeWardDeleteModal() {
    document.getElementById('ward-delete-modal').style.display = 'none';
    wardDeleteId = null;
}

/**
 * @description Issues a DELETE request for the queued ward_id.  On success,
 *   closes the modal, shows a toast, notifies the data-change bus, and reloads
 *   the table.  Error messages are shown as toasts rather than inline because
 *   the modal is closed before the error is known.
 * @returns {Promise<void>}
 */
async function deleteWard() {
    if (!wardDeleteId) return;
    const btn = document.getElementById('delete-ward-confirm-btn');
    btn.disabled = true; btn.textContent = 'Deleting…';
    try {
        const response = await fetch('http://localhost:8090/api/data/wards/delete/' + wardDeleteId, { method: 'DELETE' });
        const result   = await response.json();
        if (!response.ok) throw new Error(result.detail || 'HTTP ' + response.status);
        closeWardDeleteModal();
        showMessage(result.message, 'success');
        notifyDataChange('wards', result.message);
        loadWardsSettings();
    } catch (error) {
        showMessage('Error: ' + error.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = 'Delete';
    }
}
