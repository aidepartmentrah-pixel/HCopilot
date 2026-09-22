// patient-history.js — Page C (History), ER UI Architecture Redesign.
//
// Split view: a table of discharged (LogPatients) stays on the left, a
// persistent, resizable preview pane on the right (UI-C1/UI-C3) — replacing
// the old flat table + patient-details-modal popup. The preview reuses
// renderPatientDetailsHtml() (patient-details-view.js, UI-C2) in 'preview'
// mode; "Open Full Record" (UI-C4) reuses the same function in 'full' mode
// on a dedicated page for print/export/edit.
//
// Filters (UI-C5): GET /api/data/log-patients/list takes no query
// parameters at all — it always returns the complete archive — so every
// filter here (search/acuity/bed/date range) is client-side against the
// already-fully-loaded allHistoryData, same as the pre-redesign search box
// was. No backend change was needed for this slice.

let allHistoryData        = [];
let historyFilteredData   = [];
let historyCurrentPage    = 1;
const historyPageSize     = 50;
let historyPreviewStayId  = null; // stay_id currently shown in the preview pane, or null
let _fullRecordRow        = null; // full record cached when Open Full Record loads, for editFullRecord()

async function loadPatientHistory() {
    const container = document.getElementById('patient-history-table-container');
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading history...</div>';
    document.getElementById('hist-stats-bar').style.display  = 'none';
    document.getElementById('hist-filter-bar').style.display = 'none';

    try {
        const [listRes, statsRes] = await Promise.all([
            fetch('/api/data/log-patients/list'),
            fetch('/api/data/log-patients/stats'),
        ]);
        const listData  = await listRes.json();
        const statsData = await statsRes.json();
        if (!listRes.ok) throw new Error(listData.detail || 'HTTP ' + listRes.status);

        allHistoryData     = listData.patients;
        historyCurrentPage = 1;

        document.getElementById('hist-stat-total').textContent    = statsData.total;
        document.getElementById('hist-stat-subjects').textContent = statsData.unique_subjects;
        document.getElementById('hist-stats-bar').style.display   = 'flex';
        document.getElementById('hist-filter-bar').style.display  = 'flex';

        _populateHistoryBedOptions();

        if (allHistoryData.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-icon">📁</div><h3>No Discharged Patients Yet</h3><p>Discharged patients will appear here after discharge.</p></div>';
            historyFilteredData = [];
            return;
        }
        filterPatientHistory();
    } catch (error) {
        container.innerHTML = '<div class="error-state"><div class="error-icon">❌</div><h3>Error Loading History</h3><p>' + error.message + '</p></div>';
    }
}

// Distinct beds a discharged stay ever occupied (LogPatient.bed_history is a
// comma-separated string of bed numbers — see backend/db/models.py) —
// built from data already in memory, no new endpoint needed.
function _populateHistoryBedOptions() {
    const select = document.getElementById('hist-filter-bed');
    if (!select) return;
    const current = select.value;
    const beds = new Set();
    allHistoryData.forEach(p => {
        (p.bed_history || '').split(',').map(s => s.trim()).filter(Boolean).forEach(b => beds.add(b));
    });
    const sorted = Array.from(beds).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    select.innerHTML = '<option value="">All Beds</option>' +
        sorted.map(b => `<option value="${_escapeHtml(b)}">${_escapeHtml(b)}</option>`).join('');
    if (sorted.includes(current)) select.value = current;
}

function clearPatientHistoryFilters() {
    document.getElementById('hist-search').value = '';
    document.getElementById('hist-filter-acuity').value = '';
    document.getElementById('hist-filter-bed').value = '';
    document.getElementById('hist-filter-from').value = '';
    document.getElementById('hist-filter-to').value = '';
    filterPatientHistory();
}

function filterPatientHistory() {
    const search = document.getElementById('hist-search').value.toLowerCase().trim();
    const acuity = document.getElementById('hist-filter-acuity').value;
    const bed    = document.getElementById('hist-filter-bed').value;
    const from   = document.getElementById('hist-filter-from').value; // 'YYYY-MM-DD' or ''
    const to     = document.getElementById('hist-filter-to').value;

    historyCurrentPage = 1;
    const filtered = allHistoryData.filter(p => {
        if (search && !(
            String(p.subject_id).includes(search) ||
            String(p.stay_id).includes(search) ||
            (p.name && p.name.toLowerCase().includes(search)) ||
            (p.chiefcomplaint && p.chiefcomplaint.toLowerCase().includes(search))
        )) return false;
        if (acuity && Math.round(p.acuity) !== parseInt(acuity, 10)) return false;
        if (bed) {
            const beds = (p.bed_history || '').split(',').map(s => s.trim());
            if (!beds.includes(bed)) return false;
        }
        if ((from || to) && p.arrival_time) {
            const arrivalDate = String(p.arrival_time).slice(0, 10); // 'YYYY-MM-DD'
            if (from && arrivalDate < from) return false;
            if (to && arrivalDate > to) return false;
        } else if (from || to) {
            return false; // no arrival_time at all — can't match a date filter
        }
        return true;
    });
    renderPatientHistoryTable(filtered);
}

function historyGoToPage(page) {
    const totalPages = Math.max(1, Math.ceil(historyFilteredData.length / historyPageSize));
    if (page === 'prev') historyCurrentPage = Math.max(1, historyCurrentPage - 1);
    else if (page === 'next') historyCurrentPage = Math.min(totalPages, historyCurrentPage + 1);
    else if (page === 'last') historyCurrentPage = totalPages;
    else historyCurrentPage = page;
    renderPatientHistoryTable(historyFilteredData);
}

function _historyPaginationHtml(totalPages) {
    const atFirst = historyCurrentPage <= 1;
    const atLast  = historyCurrentPage >= totalPages;
    return '<div class="pat-pagination">' +
        '<div class="pat-pagination-controls">' +
            '<button class="pat-pagination-btn" onclick="historyGoToPage(1)" ' + (atFirst ? 'disabled' : '') + '>⏮ First</button>' +
            '<button class="pat-pagination-btn" onclick="historyGoToPage(\'prev\')" ' + (atFirst ? 'disabled' : '') + '>◀ Prev</button>' +
            '<button class="pat-pagination-btn" onclick="historyGoToPage(\'next\')" ' + (atLast ? 'disabled' : '') + '>Next ▶</button>' +
            '<button class="pat-pagination-btn" onclick="historyGoToPage(\'last\')" ' + (atLast ? 'disabled' : '') + '>Last ⏭</button>' +
        '</div>' +
        '<div class="pat-pagination-info">Page ' + historyCurrentPage + ' of ' + totalPages + '</div>' +
    '</div>';
}

function renderPatientHistoryTable(patients) {
    const container = document.getElementById('patient-history-table-container');
    const countEl   = document.getElementById('hist-visible-count');
    if (countEl) countEl.textContent = patients.length + ' record' + (patients.length !== 1 ? 's' : '');

    if (patients.length === 0) {
        container.innerHTML = '<div class="s-no-results"><div class="s-no-results-icon">🔍</div><p>No records match your filters.</p></div>';
        return;
    }

    historyFilteredData = patients;
    const totalPages = Math.max(1, Math.ceil(patients.length / historyPageSize));
    historyCurrentPage = Math.min(Math.max(1, historyCurrentPage), totalPages);
    const start    = (historyCurrentPage - 1) * historyPageSize;
    const pageRows = patients.slice(start, start + historyPageSize);

    const dash = '<span class="s-null-dash">–</span>';
    const acuityBadge = v => {
        if (v == null) return dash;
        const lvl = Math.round(v);
        const cls = (lvl >= 1 && lvl <= 5) ? 's-acuity-' + lvl : '';
        const labels = { 1:'Immediate', 2:'Emergent', 3:'Urgent', 4:'Less Urgent', 5:'Non-Urgent' };
        return '<span class="s-acuity ' + cls + '" title="' + (labels[lvl] || lvl) + '">' + v + '</span>';
    };
    const bedCell = p => {
        const beds = (p.bed_history || '').split(',').map(s => s.trim()).filter(Boolean);
        return beds.length ? _escapeHtml(beds[beds.length - 1]) : dash;
    };
    const statusBadge = p => p.departure_time
        ? '<span class="s-acuity" style="background:#e7f6ef;color:#16865c">Completed</span>'
        : dash;

    // Deliberately NOT the .pat-row class Page A's table uses — patients.js
    // binds a document-level click listener to that exact class (opening
    // its own read-only modal via a different data attribute), which fired
    // a spurious openPatientDetailsModal(NaN) on every row click here
    // before this was scoped to a class of its own. Found by actually
    // clicking through the page, not by reading the code.
    const rows = pageRows.map(p =>
        '<tr class="hist-row' + (p.stay_id === historyPreviewStayId ? ' hist-row-selected' : '') + '" data-stayid="' + p.stay_id + '">' +
        '<td>' + patIdentityCell(p.name, p.subject_id) + '</td>' +
        '<td class="s-td-id">' + p.stay_id + '</td>' +
        '<td class="pat-td-arrival">' + _formatDatetime(p.arrival_time) + '</td>' +
        '<td>' + bedCell(p) + '</td>' +
        '<td>' + statusBadge(p) + '</td>' +
        '<td>' + acuityBadge(p.acuity) + '</td>' +
        '<td class="s-td-actions">' +
            '<div style="display:flex;gap:6px;align-items:center;justify-content:flex-end">' +
                '<button class="s-action-btn s-view-btn" data-action="hist-preview" data-stayid="' + p.stay_id + '">👁️ View</button>' +
                '<div class="pat-row-menu">' +
                    '<button class="pat-icon-btn" data-action="toggle-row-menu" title="More actions">⋯</button>' +
                    '<div class="pat-row-menu-list" hidden>' +
                        '<button class="pat-row-menu-item danger" data-action="hist-delete" data-stayid="' + p.stay_id + '">🗑️ Delete</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</td>' +
        '</tr>'
    ).join('');

    container.innerHTML =
        '<div class="s-table-wrap"><table class="s-table">' +
        '<thead><tr>' +
        '<th>Patient</th><th>Stay ID</th><th>Arrival</th><th>Bed</th><th>Status</th><th>Acuity</th>' +
        '<th style="width:160px">Actions</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
        '</table></div>' +
        '<div class="s-table-footer">Showing ' + (start + 1) + '–' + (start + pageRows.length) + ' of ' + patients.length + ' record' + (patients.length !== 1 ? 's' : '') +
        (patients.length < allHistoryData.length ? ' <span class="s-filter-hint">(filtered from ' + allHistoryData.length + ' total)</span>' : '') +
        '</div>' +
        (totalPages > 1 ? _historyPaginationHtml(totalPages) : '');
}

document.addEventListener('click', function(e) {
    const previewBtn = e.target.closest('[data-action="hist-preview"]');
    const deleteBtn  = e.target.closest('[data-action="hist-delete"]');
    if (previewBtn) { selectHistoryRow(parseInt(previewBtn.dataset.stayid, 10)); return; }
    if (deleteBtn)  { confirmDeletePatient(parseInt(deleteBtn.dataset.stayid, 10), 'log'); return; }

    // Row click (excluding the Actions cell) also opens the preview — same
    // "click the row" convention as Page A's Active Patients table.
    const row = e.target.closest('.hist-row');
    if (row && !e.target.closest('.s-td-actions')) {
        selectHistoryRow(parseInt(row.dataset.stayid, 10));
    }
});

// ── Preview pane (UI-C1/UI-C2) ──────────────────────────────────────────────

async function selectHistoryRow(stayId) {
    historyPreviewStayId = stayId;
    const pane   = document.getElementById('hist-preview-pane');
    const divider = document.getElementById('hist-divider');
    const content = document.getElementById('hist-preview-content');

    // Highlight the selected row without re-fetching/re-rendering the table
    // (UI-C6 preserves scroll/filter/page state — a full re-render here
    // would reset scroll position for no reason).
    document.querySelectorAll('.hist-row').forEach(r => r.classList.toggle('hist-row-selected', parseInt(r.dataset.stayid, 10) === stayId));

    const firstOpen = pane.hidden;
    pane.hidden = false;
    divider.hidden = false;
    if (firstOpen) _histSetPreviewWidth(_histDefaultPreviewWidth());

    content.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';
    try {
        const res = await fetch('/api/patients/' + stayId + '/details');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (historyPreviewStayId !== stayId) return; // user moved on to a different row
        content.innerHTML = renderPatientDetailsHtml(data, { mode: 'preview' });
    } catch (error) {
        content.innerHTML = '<div class="error-state"><div class="error-icon">❌</div><h3>Error Loading Record</h3><p>' + error.message + '</p></div>';
    }
}

function closeHistoryPreview() {
    historyPreviewStayId = null;
    document.getElementById('hist-preview-pane').hidden = true;
    document.getElementById('hist-divider').hidden = true;
    document.querySelectorAll('.hist-row.hist-row-selected').forEach(r => r.classList.remove('hist-row-selected'));
    // Table itself is untouched — search/filter/page/scroll all survive.
}

// ── Resizable divider (UI-C3) ────────────────────────────────────────────────
// ~60–65% table / 35–40% preview by default (confirmed decision #9); the
// preview pane's width is the thing actually resized (an explicit pixel
// width), the table pane just takes whatever remains via flex:1.

function _histDefaultPreviewWidth() {
    const layout = document.getElementById('hist-layout');
    const total = layout ? layout.clientWidth : 1000;
    return Math.round(Math.min(720, Math.max(360, total * 0.38)));
}

function _histSetPreviewWidth(px) {
    const layout = document.getElementById('hist-layout');
    const pane   = document.getElementById('hist-preview-pane');
    if (!layout || !pane) return;
    const total = layout.clientWidth;
    const minTable = 420, minPreview = 360, dividerW = 14;
    const maxPreview = Math.max(minPreview, total - minTable - dividerW);
    pane.style.width = Math.min(Math.max(px, minPreview), maxPreview) + 'px';
}

let _histDragStartX = null;
let _histDragStartWidth = null;

function _histDividerMouseDown(e) {
    const pane = document.getElementById('hist-preview-pane');
    if (!pane) return;
    _histDragStartX = e.clientX;
    _histDragStartWidth = pane.getBoundingClientRect().width;
    document.getElementById('hist-divider').classList.add('dragging');
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', _histDividerMouseMove);
    document.addEventListener('mouseup', _histDividerMouseUp);
}

function _histDividerMouseMove(e) {
    if (_histDragStartX === null) return;
    // Dragging left grows the preview pane (it's on the right of the divider).
    const delta = _histDragStartX - e.clientX;
    _histSetPreviewWidth(_histDragStartWidth + delta);
}

function _histDividerMouseUp() {
    _histDragStartX = null;
    _histDragStartWidth = null;
    const divider = document.getElementById('hist-divider');
    if (divider) divider.classList.remove('dragging');
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', _histDividerMouseMove);
    document.removeEventListener('mouseup', _histDividerMouseUp);
}

document.addEventListener('DOMContentLoaded', function() {
    const divider = document.getElementById('hist-divider');
    if (divider) divider.addEventListener('mousedown', _histDividerMouseDown);
});

// ── Open Full Record (UI-C4) ─────────────────────────────────────────────────

async function openFullRecordPage(stayId) {
    showSection('patient-full-record');
    const content = document.getElementById('hist-full-record-content');
    content.innerHTML = '<div class="loading"><div class="spinner"></div>Loading record...</div>';
    try {
        const res = await fetch('/api/patients/' + stayId + '/details');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        _fullRecordRow = data;
        content.innerHTML = renderPatientDetailsHtml(data, { mode: 'full' });
    } catch (error) {
        content.innerHTML = '<div class="error-state"><div class="error-icon">❌</div><h3>Error Loading Record</h3><p>' + error.message + '</p></div>';
    }
}

function closeFullRecordPage() {
    _fullRecordRow = null;
    showSection('patient-history');
}

// Reuses the existing log-patient edit modal — Page C doesn't reinvent
// editing, it just relocates the entry point per confirmed decision #10
// (the preview pane itself stays inspection-only).
function editFullRecord() {
    if (!_fullRecordRow) return;
    const d = _fullRecordRow;
    const row = {
        patient_id: d.patient_id, subject_id: d.patient_id, stay_id: d.stay_id,
        name: d.name, gender: d.gender, age: d.age,
        arrival_time: d.arrival_time, departure_time: d.departure_time,
        bed_occupation_time: d.bed_occupation_time,
        temperature: d.temperature, heartrate: d.heartrate, resprate: d.resprate,
        o2sat: d.o2sat, sbp: d.sbp, dbp: d.dbp, pain: d.pain, acuity: d.acuity,
        chiefcomplaint: d.chiefcomplaint, destination: d.destination,
    };
    openEditPatientModal(row, d.source === 'log' ? 'log' : 'daily');
}

// Refresh whenever any data changes and History is the active section —
// same convention as patients.js/beds_display.js's own onDataChange hooks.
onDataChange(function() {
    if (document.getElementById('patient-history')?.classList.contains('active')) {
        loadPatientHistory();
    }
});
