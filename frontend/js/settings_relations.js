// Settings → Relations tab: view and manually edit any of the six many-to-many
// relation tables that link entities in the system.
//
// All tables share the same two-column structure: [left_id, right_id].
// The generic /api/relations/{table} endpoints handle all of them.
//
// Note: adding/deleting patient_doctor or patient_nurse relations also
// increments/decrements the staff member's patientNb counter on the server.

// Registry of relation tables with their human-readable label and column names.
const REL_TABLES = {
    patient_doctor: { label: '🧑‍⚕️ Patient ↔ Doctor', cols: ['patient_id', 'doctor_id'] },
    patient_nurse:  { label: '🧑‍⚕️ Patient ↔ Nurse',  cols: ['patient_id', 'nurse_id']  },
    patient_bed:    { label: '🛏️ Patient ↔ Bed',    cols: ['patient_id', 'bed_id']    },
    ward_doctor:    { label: '🏥 Ward ↔ Doctor',     cols: ['ward_id',    'doctor_id'] },
    ward_nurse:     { label: '🏥 Ward ↔ Nurse',      cols: ['ward_id',    'nurse_id']  },
    ward_bed:       { label: '🏥 Ward ↔ Bed',        cols: ['ward_id',    'bed_id']    },
};

let relActiveTable = 'ward_doctor';

// Switch to a different relation table tab and reload its data.
function switchRelTable(name) {
    relActiveTable = name;
    document.querySelectorAll('.rel-tab-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.table === name));
    loadRelationsTable(name);
}

async function loadRelationsSettings() {
    switchRelTable(relActiveTable);
}

async function loadRelationsTable(table) {
    const container = document.getElementById('relations-table-container');
    const meta = REL_TABLES[table];
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';

    try {
        const res = await fetch('/api/relations/' + table);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'HTTP ' + res.status);

        const [colA, colB] = meta.cols;
        document.getElementById('rel-col-a-label').textContent = colA;
        document.getElementById('rel-col-b-label').textContent = colB;
        document.getElementById('rel-col-a-input').placeholder = colA;
        document.getElementById('rel-col-b-input').placeholder = colB;
        document.getElementById('rel-col-a-input').value = '';
        document.getElementById('rel-col-b-input').value = '';

        if (data.rows.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No relations yet. Use the form above to add one.</p></div>';
            return;
        }

        const rows = data.rows.map(r =>
            '<tr>' +
            '<td>' + r[colA] + '</td>' +
            '<td>' + r[colB] + '</td>' +
            '<td class="s-td-actions">' +
                '<button class="s-action-btn s-del-btn" onclick="deleteRelation(\'' + table + '\',' + r[colA] + ',' + r[colB] + ')">🗑️ Remove</button>' +
            '</td>' +
            '</tr>'
        ).join('');

        container.innerHTML =
            '<div class="s-table-wrap"><table class="s-table">' +
            '<thead><tr><th>' + colA + '</th><th>' + colB + '</th><th style="width:120px">Actions</th></tr></thead>' +
            '<tbody>' + rows + '</tbody></table></div>' +
            '<div class="s-table-footer">' + data.total + ' relation' + (data.total !== 1 ? 's' : '') + '</div>';

    } catch (error) {
        container.innerHTML = '<div class="error-state"><p>Error: ' + error.message + '</p></div>';
    }
}

// POST a new row to the currently active relation table.
// Both IDs must be valid integers; the server validates that the referenced
// entities exist and that the pair is not already linked.
async function addRelation() {
    const table = relActiveTable;
    const colAVal = parseInt(document.getElementById('rel-col-a-input').value);
    const colBVal = parseInt(document.getElementById('rel-col-b-input').value);
    const errEl = document.getElementById('rel-add-error');
    errEl.style.display = 'none';

    if (isNaN(colAVal) || isNaN(colBVal)) {
        errEl.textContent = 'Both fields must be valid integers.';
        errEl.style.display = 'block';
        return;
    }

    try {
        const res = await fetch('/api/relations/' + table, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ col_a: colAVal, col_b: colBVal })
        });
        const data = await res.json();
        if (!res.ok) {
            errEl.textContent = data.detail || 'Error ' + res.status;
            errEl.style.display = 'block';
            return;
        }
        showMessage(data.message, 'success');
        notifyDataChange('relations', data.message);
        loadRelationsTable(table);
    } catch (error) {
        errEl.textContent = 'Network error: ' + error.message;
        errEl.style.display = 'block';
    }
}

async function deleteRelation(table, colA, colB) {
    try {
        const res = await fetch(`/api/relations/${table}/${colA}/${colB}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'HTTP ' + res.status);
        showMessage(data.message, 'success');
        notifyDataChange('relations', data.message);
        loadRelationsTable(table);
    } catch (error) {
        showMessage('Error: ' + error.message, 'error');
    }
}
