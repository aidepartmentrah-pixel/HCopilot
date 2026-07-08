// Unurgent Care section — displays patients who have been routed to the
// non-urgent treatment path (acuity 5 or manually sent by the OR scheduler).
//
// These patients are flagged with `unurgent = True` in DailyPatients.csv
// and shown here in a card grid with their vitals and staff assignments.
// The section supports:
//   - Full-text search across patient ID, name, and chief complaint.
//   - A discharge modal that records a departure_time, moves the record
//     to LogPatients.csv, and removes it from DailyPatients.csv.
//
// The data-change bus is NOT subscribed here because the unurgent section
// does not need to auto-refresh (initUnurgent() is called fresh on entry).

const UNURGENT_BASE = 'http://localhost:8090/api/unurgent';

// In-memory list of unurgent patients — populated by loadUnurgentSection()
let _unurgentPatients = [];

function initUnurgent() {
    loadUnurgentSection();
}

async function loadUnurgentSection() {
    _setUnurgentLoading(true);
    try {
        const res  = await fetch(`${UNURGENT_BASE}/list`);
        const data = await res.json();
        _unurgentPatients = data.patients || [];
        _renderUnurgentList();
    } catch (e) {
        document.getElementById('unurgent-list').innerHTML =
            '<div class="uu-error">Failed to load unurgent patients.</div>';
    } finally {
        _setUnurgentLoading(false);
    }
}

function _setUnurgentLoading(on) {
    const spinner = document.getElementById('unurgent-spinner');
    if (spinner) spinner.style.display = on ? 'flex' : 'none';
}

// Re-render the list applying the current search value (called on input event).
function filterUnurgentPatients() {
    _renderUnurgentList();
}

// Filter _unurgentPatients by the search box and render cards.
// The count chip above the list always shows the total, not the filtered count.
function _renderUnurgentList() {
    const el    = document.getElementById('unurgent-list');
    const count = document.getElementById('unurgent-count');
    const q     = (document.getElementById('unurgent-search')?.value || '').toLowerCase();
    if (count) count.textContent = `${_unurgentPatients.length} patient${_unurgentPatients.length !== 1 ? 's' : ''}`;

    const items = _unurgentPatients.filter(p =>
        !q ||
        String(p.subject_id).includes(q) ||
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.chiefcomplaint && p.chiefcomplaint.toLowerCase().includes(q))
    );

    if (!items.length) {
        el.innerHTML = `<div class="uu-empty">${_unurgentPatients.length === 0
            ? 'No patients in the unurgent treatment path yet.'
            : 'No patients match your search.'}</div>`;
        return;
    }

    el.innerHTML = items.map(p => _buildPatientCard(p)).join('');
}

// Build a single patient card HTML string.
// Vitals, staff badges, and complaint are all optional — null values are omitted.
function _buildPatientCard(p) {
    const name = p.name
        ? `<div class="uu-card-name">${p.name}${p.age != null ? ', ' + p.age + ' y/o' : ''}${p.gender ? ' · ' + p.gender : ''}</div>`
        : '';

    const vitals = [
        p.temperature != null ? `🌡 ${p.temperature}°C` : null,
        p.heartrate    != null ? `💓 ${p.heartrate} bpm` : null,
        p.o2sat        != null ? `🫁 O₂ ${p.o2sat}%` : null,
        p.sbp != null && p.dbp != null ? `🩸 ${p.sbp}/${p.dbp} mmHg` : null,
        p.pain != null ? `😣 Pain: ${p.pain}` : null,
    ].filter(Boolean).join(' · ');

    const complaint = p.chiefcomplaint
        ? `<div class="uu-card-complaint">📋 ${p.chiefcomplaint}</div>` : '';

    const arrivalStr = p.arrival_time
        ? `<span class="uu-card-time">Arrived: ${p.arrival_time}</span>` : '';

    const docBadge   = p.doctor_ids?.length
        ? `<span class="uu-badge uu-badge-doc">👨‍⚕️ Dr #${p.doctor_ids.join(', #')}</span>` : '';
    const nurseBadge = p.nurse_ids?.length
        ? `<span class="uu-badge uu-badge-nurse">👩‍⚕️ Nurse #${p.nurse_ids.join(', #')}</span>` : '';

    return `
    <div class="uu-card" id="uu-card-${p.subject_id}">
        <div class="uu-card-header">
            <div class="uu-card-id">
                <span class="uu-acuity-badge">Acuity ${p.acuity ?? '—'}</span>
                Patient #${p.subject_id}
            </div>
            <div class="uu-card-badges">${docBadge}${nurseBadge}${arrivalStr}</div>
        </div>
        ${name}
        ${complaint}
        ${vitals ? `<div class="uu-card-vitals">${vitals}</div>` : ''}
        <div class="uu-card-footer">
            <button class="uu-discharge-btn"
                    onclick="openUnurgentDischargeModal(${p.subject_id})">
                🏠 Discharge
            </button>
        </div>
    </div>`;
}

// ── Discharge modal ───────────────────────────────────────────────────────────
// Discharge stamps a departure_time on the patient record, moves it to
// LogPatients.csv, and removes it from DailyPatients.csv (and the unurgent flag).

// subject_id of the patient being discharged (set by openUnurgentDischargeModal)
let _unurgentDischargePatientId = null;

function openUnurgentDischargeModal(patientId) {
    _unurgentDischargePatientId = patientId;

    // Populate patient info from cache
    const p = _unurgentPatients.find(pt => pt.subject_id === patientId);

    const subtitleEl = document.getElementById('uu-dm-patient-info');
    if (subtitleEl) {
        subtitleEl.textContent = p && p.name
            ? `${p.name}  ·  Patient #${patientId}`
            : `Patient #${patientId}`;
    }

    const chipsEl = document.getElementById('uu-dm-details');
    if (chipsEl && p) {
        const chips = [];
        if (p.acuity  != null) chips.push(`Acuity ${p.acuity}`);
        if (p.age     != null) chips.push(`${p.age} y/o`);
        if (p.gender)          chips.push(p.gender);
        if (p.chiefcomplaint)  chips.push(p.chiefcomplaint);
        if (p.arrival_time)    chips.push(`Arrived: ${p.arrival_time}`);
        chipsEl.innerHTML = chips
            .map(t => `<span class="uu-dm-chip">${t}</span>`)
            .join('');
    } else if (chipsEl) {
        chipsEl.innerHTML = '';
    }

    // Default departure time to now
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const localNow = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const dtInput = document.getElementById('uu-discharge-time');
    if (dtInput) dtInput.value = localNow;

    const modal = document.getElementById('uu-discharge-modal');
    if (modal) modal.style.display = 'flex';
}

function closeUnurgentDischargeModal() {
    _unurgentDischargePatientId = null;
    const modal = document.getElementById('uu-discharge-modal');
    if (modal) modal.style.display = 'none';
}

async function confirmUnurgentDischarge() {
    const pid = _unurgentDischargePatientId;
    if (!pid) return;

    const dtInput = document.getElementById('uu-discharge-time');
    const departure_time = dtInput?.value || null;

    const btn = document.getElementById('uu-discharge-confirm-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Discharging…'; }

    try {
        const res = await fetch(`${UNURGENT_BASE}/discharge/${pid}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ departure_time }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Discharge failed');

        closeUnurgentDischargeModal();
        showMessage(`Patient #${pid} discharged from unurgent care (${data.departure_time}).`, 'success');
        await loadUnurgentSection();

    } catch (err) {
        showMessage(`Discharge error: ${err.message}`, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Confirm Discharge'; }
    }
}
