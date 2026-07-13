// Settings → Beds tab: full CRUD for beds (EDbeds.csv).
// A bed's "Occupied" status is computed at read-time by joining with patient_bed.csv;
// only "Available" and "Under Repair" are valid values to store on disk.
// On save, both the settings beds table and the managed dataset card ("EDbeds")
// are refreshed so all views stay in sync.

// 'add' | 'edit' — controls whether saveBed() calls POST or PUT
let settingsBedMode = 'add';
// ID of the bed being edited (null when adding)
let settingsCurrentBedId = null;
// ID of the bed queued for deletion (set by confirmDeleteBed)
let settingsDeleteBedId = null;
// Full unfiltered list fetched from the API; used to re-filter without re-fetching
let allBedsData = [];

// Cycling colour palette used to visually distinguish wards in the beds table.
// Index is (ward_id - 1) % WARD_PALETTE.length so each ward always gets the same colour.
const WARD_PALETTE = [
    {bg:'#eef2ff', color:'#4338ca', border:'#c7d2fe'},
    {bg:'#ecfdf5', color:'#065f46', border:'#a7f3d0'},
    {bg:'#fff7ed', color:'#9a3412', border:'#fed7aa'},
    {bg:'#fef2f2', color:'#991b1b', border:'#fecaca'},
    {bg:'#fdf4ff', color:'#7e22ce', border:'#e9d5ff'},
    {bg:'#f0fdf4', color:'#166534', border:'#bbf7d0'},
    {bg:'#eff6ff', color:'#1d4ed8', border:'#bfdbfe'},
];

// Delegated click handler for Edit/Delete buttons embedded in the table rows.
// Using event delegation (listening on document) avoids re-attaching listeners
// every time the table is re-rendered.
document.addEventListener('click', function(e) {
    const editBtn = e.target.closest('[data-action="edit-bed"]');
    const delBtn  = e.target.closest('[data-action="delete-bed"]');
    if (editBtn) {
        openEditBedModal(
            parseInt(editBtn.dataset.id),
            editBtn.dataset.number,
            editBtn.dataset.status,
            parseInt(editBtn.dataset.ward),
            editBtn.dataset.type
        );
    }
    if (delBtn) {
        confirmDeleteBed(parseInt(delBtn.dataset.id), delBtn.dataset.number);
    }
});

window.addEventListener('click', function(e) {
    if (e.target === document.getElementById('bed-form-modal'))  closeBedFormModal();
    if (e.target === document.getElementById('bed-delete-modal')) closeBedDeleteModal();
});

// Fetch the full bed list and stats, populate the filter bar ward dropdown,
// and render the beds table.
async function loadSettingsBeds() {
    const container = document.getElementById('settings-beds-container');
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading beds...</div>';
    document.getElementById('s-stats-bar').style.display  = 'none';
    document.getElementById('s-filter-bar').style.display = 'none';
    try {
        const response = await fetch('/api/beds/list');
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'HTTP ' + response.status);

        allBedsData = data.beds;

        if (allBedsData.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-icon">🛏️</div><h3>No Beds Found</h3><p>Click "Add New Bed" to get started.</p></div>';
            return;
        }

        const available = allBedsData.filter(b => b.bed_status === 'Available').length;
        const occupied  = allBedsData.filter(b => b.bed_status === 'Occupied').length;
        const wardIds   = [...new Set(allBedsData.map(b => b.ward_id))];
        const pct       = Math.round(occupied / allBedsData.length * 100);

        document.getElementById('s-stat-total').textContent = allBedsData.length;
        document.getElementById('s-stat-avail').textContent = available;
        document.getElementById('s-stat-occ').textContent   = occupied;
        document.getElementById('s-stat-wards').textContent  = wardIds.length;
        document.getElementById('s-occ-bar-fill').style.width = pct + '%';
        document.getElementById('s-occ-pct').textContent    = pct + '%';
        document.getElementById('s-stats-bar').style.display  = 'flex';

        const wardSelect = document.getElementById('s-filter-ward');
        const sortedWards = [...wardIds].sort((a, b) => a - b);
        wardSelect.innerHTML = '<option value="">All Wards</option>' +
            sortedWards.map(w => {
                const name = allBedsData.find(b => b.ward_id === w)?.ward_name || ('Ward ' + w);
                return '<option value="' + w + '">' + name + '</option>';
            }).join('');

        document.getElementById('s-search').value = '';
        document.getElementById('s-filter-status').value = '';
        document.getElementById('s-filter-bar').style.display = 'flex';

        renderBedsTable(allBedsData);
    } catch (error) {
        container.innerHTML = '<div class="error-state"><div class="error-icon">❌</div><h3>Error Loading Beds</h3><p>' + error.message + '</p></div>';
    }
}

// Client-side filter: searches allBedsData in memory and re-renders the table
// without making a new network request.
function filterBeds() {
    const search = document.getElementById('s-search').value.toLowerCase().trim();
    const ward   = document.getElementById('s-filter-ward').value;
    const status = document.getElementById('s-filter-status').value;
    const type   = document.getElementById('s-filter-type')?.value || '';
    const filtered = allBedsData.filter(b => {
        return (!search || b.bed_number.toLowerCase().includes(search))
            && (!ward   || String(b.ward_id) === ward)
            && (!status || b.bed_status === status)
            && (!type   || (b.bed_type || 'normal') === type);
    });
    renderBedsTable(filtered);
}

function renderBedsTable(beds) {
    const container  = document.getElementById('settings-beds-container');
    const countEl    = document.getElementById('s-visible-count');
    if (countEl) countEl.textContent = beds.length + ' bed' + (beds.length !== 1 ? 's' : '');

    if (beds.length === 0) {
        container.innerHTML = '<div class="s-no-results"><div class="s-no-results-icon">🔍</div><p>No beds match your filters.</p></div>';
        return;
    }

    const rows = beds.map(b => {
        const p = WARD_PALETTE[(b.ward_id - 1) % WARD_PALETTE.length];
        const isAvail = b.bed_status === 'Available';
        const wardLabel = b.ward_name || (b.ward_id != null ? 'Ward ' + b.ward_id : '–');
        const btype = b.bed_type || 'normal';
        return '<tr>' +
            '<td class="s-td-id">' + b.bed_id + '</td>' +
            '<td class="s-td-num"><span class="s-bed-num-pill">' + b.bed_number + '</span></td>' +
            '<td><span class="s-status ' + (isAvail ? 's-avail' : 's-occ') + '">' + b.bed_status + '</span></td>' +
            '<td><span class="bed-type-badge type-' + btype.toLowerCase() + '">' + btype + '</span></td>' +
            '<td>' + (b.ward_id != null ? '<span class="s-ward-badge" style="background:' + p.bg + ';color:' + p.color + ';border:1px solid ' + p.border + '">' + wardLabel + '</span>' : '<span class="s-null-dash">–</span>') + '</td>' +
            '<td class="s-td-actions">' +
                '<button class="s-action-btn s-edit-btn" data-action="edit-bed" data-id="' + b.bed_id + '" data-number="' + b.bed_number + '" data-status="' + b.bed_status + '" data-ward="' + (b.ward_id || '') + '" data-type="' + btype + '">✏️ Edit</button>' +
                '<button class="s-action-btn s-del-btn" data-action="delete-bed" data-id="' + b.bed_id + '" data-number="' + b.bed_number + '">🗑️ Delete</button>' +
            '</td>' +
        '</tr>';
    }).join('');

    container.innerHTML =
        '<div class="s-table-wrap"><table class="s-table">' +
        '<thead><tr><th style="width:55px">ID</th><th>Bed Number</th><th>Status</th><th>Type</th><th>Ward</th><th style="width:170px">Actions</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
        '</table></div>' +
        '<div class="s-table-footer">' + beds.length + ' beds shown' +
        (beds.length < allBedsData.length ? ' <span class="s-filter-hint">(filtered from ' + allBedsData.length + ' total)</span>' : '') +
        '</div>';
}

// Toggle-button helpers — each updates the hidden form field and highlights
// the matching button so the visual selection and the submitted value stay in sync.

function selectStatus(val) {
    document.getElementById('form-bed-status').value = val;
    document.querySelectorAll('.status-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === val);
    });
}

function selectBedType(val) {
    document.getElementById('form-bed-type').value = val;
    document.querySelectorAll('.bed-type-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === val);
    });
}

// Quick-select a ward ID from the chip row; mirrors the typed input.
function selectWardQuick(wardId) {
    document.getElementById('form-ward-id').value = wardId;
    document.querySelectorAll('.ward-quick-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.ward) === wardId);
    });
}

// Keep the quick-select chips in sync when the user types a ward ID manually.
function syncWardChips() {
    const val = parseInt(document.getElementById('form-ward-id').value);
    document.querySelectorAll('.ward-quick-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.ward) === val);
    });
}

// Render one quick-select chip per ward that already exists in allBedsData,
// so the user can pick a ward with a single click instead of typing its ID.
function populateWardQuickButtons(currentWardId) {
    const wardIds = [...new Set(allBedsData.map(b => b.ward_id))].sort((a,b) => a-b);
    const row = document.getElementById('ward-quick-row');
    if (!wardIds.length) { row.innerHTML = ''; return; }
    row.innerHTML = wardIds.map(w =>
        '<button type="button" class="ward-quick-btn ' + (w === currentWardId ? 'active' : '') + '" ' +
        'data-ward="' + w + '" onclick="selectWardQuick(' + w + ')">Ward ' + w + '</button>'
    ).join('');
}

function setFormError(msg) {
    const el = document.getElementById('bed-form-error');
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
}

function openAddBedModal() {
    settingsBedMode = 'add';
    settingsCurrentBedId = null;
    document.getElementById('bed-form-title').textContent = 'Add New Bed';
    document.getElementById('form-bed-number').value = '';
    document.getElementById('form-ward-id').value   = '';
    selectStatus('Available');
    selectBedType('normal');
    setFormError('');
    populateWardQuickButtons(null);
    document.getElementById('bed-form-modal').style.display = 'block';
    setTimeout(() => document.getElementById('form-bed-number').focus(), 100);
}

function openEditBedModal(bedId, bedNumber, bedStatus, wardId, bedType) {
    settingsBedMode = 'edit';
    settingsCurrentBedId = bedId;
    document.getElementById('bed-form-title').textContent = 'Edit Bed ' + bedNumber;
    document.getElementById('form-bed-number').value = bedNumber;
    document.getElementById('form-ward-id').value   = wardId || '';
    selectStatus(bedStatus);
    selectBedType(bedType || 'normal');
    setFormError('');
    populateWardQuickButtons(wardId);
    document.getElementById('bed-form-modal').style.display = 'block';
}

function closeBedFormModal() {
    document.getElementById('bed-form-modal').style.display = 'none';
}

// POST (add) or PUT (edit) the bed form to the API.
// On success: close modal, show toast, broadcast data-change event, and
// refresh both the beds table and the managed EDbeds dataset card.
async function saveBed() {
    const bedNumber = document.getElementById('form-bed-number').value.trim();
    const bedStatus = document.getElementById('form-bed-status').value;
    const bedType   = document.getElementById('form-bed-type').value;
    const wardRaw = document.getElementById('form-ward-id').value;
    const wardId  = wardRaw ? parseInt(wardRaw) : null;

    setFormError('');
    if (!bedNumber) { setFormError('Bed number is required.'); return; }
    if (wardRaw && (isNaN(wardId) || wardId < 1)) { setFormError('Ward ID must be a positive integer.'); return; }

    const payload = { bed_number: bedNumber, bed_status: bedStatus, ward_id: wardId, bed_type: bedType };
    const btn = document.getElementById('save-bed-btn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
        const url    = settingsBedMode === 'add'
            ? '/api/beds/add'
            : '/api/beds/modify/' + settingsCurrentBedId;
        const method = settingsBedMode === 'add' ? 'POST' : 'PUT';
        const response = await fetch(url, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        const result   = await response.json();
        if (!response.ok) { setFormError(parseApiError(result.detail) || 'Error ' + response.status); return; }
        closeBedFormModal();
        showMessage(result.message, 'success');
        notifyDataChange('beds', result.message);
        loadSettingsBeds();
        refreshManagedCard('EDbeds');
    } catch (error) {
        setFormError('Network error: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save Bed';
    }
}

function confirmDeleteBed(bedId, bedNumber) {
    settingsDeleteBedId = bedId;
    document.getElementById('delete-bed-label').textContent = 'Bed ' + bedNumber + ' (ID: ' + bedId + ')';
    document.getElementById('bed-delete-modal').style.display = 'block';
}

function closeBedDeleteModal() {
    document.getElementById('bed-delete-modal').style.display = 'none';
    settingsDeleteBedId = null;
}

async function deleteBed() {
    if (!settingsDeleteBedId) return;
    const btn = document.getElementById('delete-confirm-btn');
    btn.disabled = true;
    btn.textContent = 'Deleting…';
    try {
        const response = await fetch('/api/beds/delete/' + settingsDeleteBedId, { method: 'DELETE' });
        const result   = await response.json();
        if (!response.ok) throw new Error(result.detail || 'HTTP ' + response.status);
        closeBedDeleteModal();
        showMessage(result.message, 'success');
        notifyDataChange('beds', result.message);
        loadSettingsBeds();
        refreshManagedCard('EDbeds');
    } catch (error) {
        showMessage('Error: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Delete';
    }
}
