// Settings → Log Patients tab: read and edit the discharged-patient archive
// stored in LogPatients.csv.  Rows are written here automatically on discharge;
// this table allows manual corrections and deletion of erroneous records.
// Unlike DailyPatients, there is no "Add" button — entries must arrive via discharge.

// Full unfiltered array from the API; filtered in memory on search
let allLogData = [];

async function loadLogPatientsSettings() {
    const container = document.getElementById('settings-lp-container');
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading log patients...</div>';
    document.getElementById('lp-stats-bar').style.display  = 'none';
    document.getElementById('lp-filter-bar').style.display = 'none';

    try {
        const [listRes, statsRes] = await Promise.all([
            fetch('/api/data/log-patients/list'),
            fetch('/api/data/log-patients/stats')
        ]);
        const listData  = await listRes.json();
        const statsData = await statsRes.json();
        if (!listRes.ok)  throw new Error(listData.detail  || 'HTTP ' + listRes.status);
        if (!statsRes.ok) throw new Error(statsData.detail || 'HTTP ' + statsRes.status);

        allLogData = listData.patients;

        document.getElementById('lp-stat-total').textContent    = statsData.total;
        document.getElementById('lp-stat-subjects').textContent = statsData.unique_subjects;
        document.getElementById('lp-stats-bar').style.display   = 'flex';
        document.getElementById('lp-search').value = '';
        document.getElementById('lp-filter-bar').style.display  = 'flex';

        if (allLogData.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><h3>No Discharged Patients Yet</h3><p>Discharged patients will appear here.</p></div>';
            return;
        }
        renderLogTable(allLogData);
    } catch (error) {
        container.innerHTML = '<div class="error-state"><div class="error-icon">❌</div><h3>Error Loading Data</h3><p>' + error.message + '</p></div>';
    }
}

function filterLogPatients() {
    const search = document.getElementById('lp-search').value.toLowerCase().trim();
    const filtered = allLogData.filter(p =>
        !search
        || String(p.subject_id).includes(search)
        || String(p.stay_id).includes(search)
        || (p.name && p.name.toLowerCase().includes(search))
        || (p.chiefcomplaint && p.chiefcomplaint.toLowerCase().includes(search))
    );
    renderLogTable(filtered);
}

function renderLogTable(patients) {
    const container = document.getElementById('settings-lp-container');
    const countEl   = document.getElementById('lp-visible-count');
    if (countEl) countEl.textContent = patients.length + ' record' + (patients.length !== 1 ? 's' : '');

    if (patients.length === 0) {
        container.innerHTML = '<div class="s-no-results"><div class="s-no-results-icon">🔍</div><p>No records match your filters.</p></div>';
        return;
    }

    const dash = '<span class="s-null-dash">–</span>';
    const fmt  = v => (v !== null && v !== undefined ? v : dash);

    const fmtDt = v => {
        if (!v) return '<span class="s-null-dash">–</span>';
        try {
            const d = new Date(v);
            if (isNaN(d)) return v;
            return d.toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
        } catch (_) { return v; }
    };

    const acuityBadge = v => {
        if (v == null) return dash;
        const lvl = Math.round(v);
        const cls = lvl >= 1 && lvl <= 5 ? 's-acuity-' + lvl : '';
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
        '<td>' + fmtDt(p.arrival_time) + '</td>' +
        '<td>' + fmtDt(p.departure_time) + '</td>' +
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
        '<th>Subject ID</th><th>Stay ID</th><th>Name</th><th>Gender</th><th>Age</th>' +
        '<th>Arrival Time</th><th>Departure Time</th><th>Destination</th><th>Bed Occupation</th><th>Bed History</th>' +
        '<th>Temp</th><th>HR</th><th>RR</th>' +
        '<th>O₂ Sat</th><th>SBP</th><th>DBP</th><th>Pain</th><th>Acuity</th><th>Chief Complaint</th>' +
        '<th style="width:90px">Actions</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
        '</table></div>' +
        '<div class="s-table-footer">' + patients.length + ' records shown' +
        (patients.length < allLogData.length ? ' <span class="s-filter-hint">(filtered from ' + allLogData.length + ' total)</span>' : '') +
        '</div>';
}

// Delegated click handler for table action buttons.
// Passes 'log' as the source parameter so openEditPatientModal / confirmDeletePatient
// (defined in patients.js) know to call the log-patients API endpoints instead
// of the daily-patients ones.
document.addEventListener('click', function(e) {
    const editBtn = e.target.closest('[data-action="edit-log-patient"]');
    const delBtn  = e.target.closest('[data-action="delete-log-patient"]');
    if (editBtn) openEditPatientModal(JSON.parse(editBtn.dataset.row), 'log');
    if (delBtn)  confirmDeletePatient(parseInt(delBtn.dataset.stayid), 'log');
});
