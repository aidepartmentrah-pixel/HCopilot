/**
 * beds_display.js — Page B, the Live ER Board (ER UI Architecture Redesign).
 *
 * Renders beds AND waiting (no-bed) patients as one set of horizontal,
 * ward-grouped lanes, using one shared card component for both (confirmed
 * decision #5 — same dimensions/radius/spacing/typography, only the icon and
 * status treatment differ). Replaces the old wrap-grid of decorative bed
 * graphics plus a separate Unurgent-derived flat list.
 *
 * Responsibilities:
 *   loadBeds()              — fetch /api/beds/stats, /api/beds/list, and
 *                             /api/beds/bedless together, render the summary
 *                             stat row (UI-B4) and every lane (UI-B2/UI-B3)
 *                             in one pass.
 *   _erbCardFromBed()/
 *   _erbCardFromBedless()   — normalize a bed row / bedless-patient row into
 *                             the one card descriptor shape _erbCardHtml()
 *                             renders (UI-B1).
 *   _erbIsWaitingOverThreshold() — waiting-time attention treatment (UI-B5):
 *                             arrival > 5 min ago AND triage_time still null
 *                             (open question 3, confirmed: "handled" =
 *                             triage_time set).
 *   openBedModal(bedId)     — open the bed detail modal; fetches current patient
 *                             info and available doctors/nurses for assignment.
 *   assignPatient()         — POST /api/scheduling/assign to link a patient to this bed.
 *   releaseBed()            — POST /api/beds/release/{bedId} to free the bed.
 *   setCondition()          — POST /api/beds/condition/{bedId} to mark dirty/available.
 *   confirmDischarge()      — POST /api/scheduling/discharge/{stayId} to archive the
 *                             patient to LogPatients and release the bed.
 *   openBedlessDischargeModal() / confirmBedlessDischarge() — the waiting-card's
 *                             one action (clicking the card opens this modal
 *                             directly — no separate button, no "view
 *                             details" surface existed for a bedless patient
 *                             before this redesign either).
 *
 * Global state:
 *   currentBedId     — bed_id of the bed open in the detail modal
 *   currentPatientId — patient_id currently on that bed (null if empty)
 *   _bedlessPatients — in-memory list, refreshed by loadBeds(); backs both
 *                      the Waiting/No-Bed lane and the discharge modal's lookup
 */

let currentBedId     = null;  // bed currently open in the detail modal
let currentPatientId = null;  // patient currently on that bed (null if empty)

let bedsFitActive       = false;  // whether "Fit to Screen" kiosk mode is on
let bedsFitResizeHandler = null;  // bound resize listener, so it can be removed on exit

// ER UI Architecture Redesign, Page B — waiting-time threshold for the
// attention treatment (UI-B5). Open question 3, confirmed: "handled" means
// triage_time is set, so "waiting > 5 min" = arrival more than 5 minutes ago
// AND triage_time still null — reuses the column ER10 added for exactly
// this purpose, no new backend field needed.
const ERB_WAIT_ATTENTION_MINUTES = 5;

let _bedlessPatients = [];             // in-memory list, refreshed by loadBeds(); also backs the discharge modal's lookup
let _bedlessDischargePatientId = null; // subject_id of the patient being discharged

function _erbMinutesSince(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return null;
    return Math.floor((Date.now() - d.getTime()) / 60000);
}

function _erbIsWaitingOverThreshold(p) {
    if (p.triage_time) return false; // "handled" — confirmed decision, open question 3
    const mins = _erbMinutesSince(p.arrival_time);
    return mins !== null && mins > ERB_WAIT_ATTENTION_MINUTES;
}

function _erbStatCard(icon, value, label, modifierClass) {
    return `<div class="s-stat-card ${modifierClass || ''}">
        <span class="s-stat-icon">${icon}</span>
        <div class="s-stat-content">
            <span class="s-stat-val">${value}</span>
            <span class="s-stat-lbl">${label}</span>
        </div>
    </div>`;
}

// Unified card renderer (confirmed decision #5) — one shape for both a bed
// and a waiting (no-bed) patient; only the icon and the status/color variant
// differ. `c` is a plain descriptor built by _erbCardFromBed()/
// _erbCardFromBedless() below, never rendered directly from raw API shapes,
// so the two data sources never leak their differing field names into here.
function _erbCardHtml(c) {
    return `<div class="erb-card erb-card-${c.statusClass}${c.attentionClass || ''}" id="${c.domId}" onclick="${c.onclick}">
        <div class="erb-card-top">
            <span class="erb-card-icon" aria-hidden="true">${c.icon}</span>
            <span class="erb-card-status-badge">${c.statusLabel}</span>
        </div>
        <div class="erb-card-primary">${c.primary}</div>
        <div class="erb-card-sub">${c.sub}</div>
        ${c.patientHtml ? `<div class="erb-card-patient">${c.patientHtml}</div>` : ''}
    </div>`;
}

function _erbCardFromBed(bed) {
    const statusClass = bed.bed_status.toLowerCase().replace(/ /g, '-'); // available|occupied|under-repair
    const btype = bed.bed_type || 'normal';
    let patientHtml = '';
    if (bed.patient_id != null) {
        const nameLine = bed.patient_name ? `<div class="erb-card-name">${_escapeHtml(bed.patient_name)}</div>` : '';
        const metaParts = [];
        if (bed.patient_age != null) metaParts.push(bed.patient_age + ' y/o');
        if (bed.patient_gender)      metaParts.push(bed.patient_gender);
        patientHtml = `<div class="erb-card-id">#${bed.patient_id}</div>${nameLine}` +
            (metaParts.length ? `<div class="erb-card-meta">${_escapeHtml(metaParts.join(' · '))}</div>` : '');
    }
    return {
        domId: `bed-card-${bed.bed_id}`,
        statusClass,
        statusLabel: bed.bed_status,
        icon: '🛏️',
        primary: _escapeHtml(bed.bed_number),
        sub: _escapeHtml((bed.ward_name ? bed.ward_name + ' · ' : '') + btype),
        patientHtml,
        onclick: `openBedModal(${bed.bed_id}, '${bed.bed_number}', '${bed.bed_status}', ${bed.patient_id}, '${btype}')`,
    };
}

// Interaction parity with a bed card (confirmed decision #5: "same...
// interaction locations") — clicking either opens that card's one available
// action surface: a bed card opens the bed modal (assign/release/repair);
// a waiting card opens the discharge modal, its only action today (no
// "view details" ever existed for a bedless patient before this redesign,
// so none is invented here — see the tracking doc's log for this call).
function _erbCardFromBedless(p) {
    const attention = _erbIsWaitingOverThreshold(p);
    const name = p.name
        ? `<div class="erb-card-name">${_escapeHtml(p.name)}${p.age != null ? ', ' + p.age + ' y/o' : ''}${p.gender ? ' · ' + _escapeHtml(p.gender) : ''}</div>`
        : '<div class="erb-card-name unknown">Unknown Patient</div>';
    const complaint = p.chiefcomplaint ? `<div class="erb-card-complaint">${_escapeHtml(p.chiefcomplaint)}</div>` : '';
    const mins = _erbMinutesSince(p.arrival_time);
    const waitBadge = attention ? `<div class="erb-card-wait-badge">⏱️ Waiting ${mins}m</div>` : '';
    return {
        domId: `bedless-card-${p.subject_id}`,
        statusClass: 'waiting',
        statusLabel: 'Waiting',
        icon: '🧑',
        primary: 'Acuity ' + (p.acuity ?? '—'),
        sub: '#' + p.subject_id,
        patientHtml: `${name}${complaint}${waitBadge}`,
        onclick: `openBedlessDischargeModal(${p.subject_id})`,
        attentionClass: attention ? ' erb-card-attention' : '',
    };
}

function _renderErbLane(laneKey, title, cardDescriptors) {
    const trackId = 'erb-lane-' + laneKey;
    const noun = laneKey === 'waiting' ? 'patient' : 'bed';
    const count = `${cardDescriptors.length} ${noun}${cardDescriptors.length !== 1 ? 's' : ''}`;
    return `<div class="erb-lane">
        <div class="erb-lane-header">
            <h3>${_escapeHtml(title)}</h3>
            <span class="erb-lane-count">${count}</span>
            <div class="erb-lane-nav">
                <button type="button" class="erb-lane-nav-btn" onclick="_erbScrollLane('${trackId}', -1)" aria-label="Scroll ${_escapeHtml(title)} left">‹</button>
                <button type="button" class="erb-lane-nav-btn" onclick="_erbScrollLane('${trackId}', 1)" aria-label="Scroll ${_escapeHtml(title)} right">›</button>
            </div>
        </div>
        <div class="erb-lane-track" id="${trackId}">
            ${cardDescriptors.length ? cardDescriptors.map(_erbCardHtml).join('') : '<div class="erb-lane-empty">Nothing here right now.</div>'}
        </div>
    </div>`;
}

function _erbScrollLane(trackId, direction) {
    const el = document.getElementById(trackId);
    if (el) el.scrollBy({ left: direction * 340, behavior: 'smooth' });
}

async function loadBeds() {
    // Fetch bed stats, the full bed list, and the bedless (no-bed) list all
    // together — the Waiting/No-Bed lane and the summary stat row both need
    // the bedless data, so it's no longer a separate independently-triggered
    // fetch (loadBedlessSection(), pre-redesign) but part of one render pass.
    const statsContainer = document.getElementById('beds-stats');
    const lanesContainer = document.getElementById('erb-lanes');

    try {
        const [statsRes, bedsRes, bedlessRes] = await Promise.all([
            fetch('/api/beds/stats'),
            fetch('/api/beds/list'),
            fetch('/api/beds/bedless'),
        ]);
        const stats       = await statsRes.json();
        const bedsData    = await bedsRes.json();
        const bedlessData = await bedlessRes.json();
        _bedlessPatients  = bedlessData.patients || [];

        const waitingOver = _bedlessPatients.filter(_erbIsWaitingOverThreshold).length;

        // Summary stat row (UI-B4) — Total/Occupied/Available already come
        // from /api/beds/stats unchanged; Without Bed = the bedless
        // endpoint's own count; Waiting > 5 min is the only new computation.
        statsContainer.innerHTML = `<div class="s-stats-bar erb-stats-bar">
            ${_erbStatCard('🛏️', stats.total_beds, 'Total Beds')}
            ${_erbStatCard('🔴', stats.occupied, 'Occupied Beds', 's-stat-card-occ')}
            ${_erbStatCard('🟢', stats.available, 'Available Beds', 's-stat-card-avail')}
            ${_erbStatCard('🧑', _bedlessPatients.length, 'Patients Without Bed', 's-stat-card-nobed')}
            ${_erbStatCard('⏱️', waitingOver, 'Waiting > 5 min', waitingOver > 0 ? 's-stat-card-wait' : '')}
        </div>`;

        // Group beds by ward for lane rendering; beds with no ward go to "Unassigned"
        const bedsByWard = {};
        const unassigned = [];
        bedsData.beds.forEach(bed => {
            if (bed.ward_id != null) {
                if (!bedsByWard[bed.ward_id]) bedsByWard[bed.ward_id] = [];
                bedsByWard[bed.ward_id].push(bed);
            } else {
                unassigned.push(bed);
            }
        });
        const wardIds = Object.keys(bedsByWard).sort((a, b) => parseInt(a) - parseInt(b));

        let html = wardIds.map(w => {
            const name = bedsByWard[w][0]?.ward_name || ('Ward ' + w);
            return _renderErbLane('ward-' + w, name, bedsByWard[w].map(_erbCardFromBed));
        }).join('');
        if (unassigned.length > 0) html += _renderErbLane('unassigned', 'Unassigned', unassigned.map(_erbCardFromBed));
        // Waiting/No-Bed — one catch-all lane, last (matches the confirmed
        // reading of open question 2: not per-ward slots).
        html += _renderErbLane('waiting', 'Waiting / No Bed', _bedlessPatients.map(_erbCardFromBedless));

        lanesContainer.innerHTML = html;

        if (bedsFitActive) applyBedsFitScale();  // re-fit after live data changes the content height

    } catch (error) {
        statsContainer.innerHTML = `<div class="error-state"><p>Error loading bed statistics: ${error.message}</p></div>`;
        lanesContainer.innerHTML = `<div class="error-state"><div class="error-icon">❌</div><h3>Error Loading Beds</h3><p>${error.message}</p></div>`;
        showMessage(`Error loading beds: ${error.message}`, 'error');
    }
}

// ── Bedless discharge modal ─────────────────────────────────────────────────
// Same endpoint the former Unurgent section used (/api/unurgent/discharge/{id})
// — it now runs the shared discharge_active_stay() underneath (see
// patient_management/discharge_manager.py) and works for any bedless patient,
// not only ones flagged unurgent=True. Kept as-is rather than renamed, per
// the "URL/behavior unchanged, only the internals were unified" ER4 design.

function openBedlessDischargeModal(patientId) {
    _bedlessDischargePatientId = patientId;
    const p = _bedlessPatients.find(pt => pt.subject_id === patientId);

    const subtitleEl = document.getElementById('bedless-dm-patient-info');
    if (subtitleEl) {
        subtitleEl.textContent = p && p.name ? `${p.name}  ·  Patient #${patientId}` : `Patient #${patientId}`;
    }

    const chipsEl = document.getElementById('bedless-dm-details');
    if (chipsEl && p) {
        const chips = [];
        if (p.acuity  != null) chips.push(`Acuity ${p.acuity}`);
        if (p.age     != null) chips.push(`${p.age} y/o`);
        if (p.gender)          chips.push(p.gender);
        if (p.chiefcomplaint)  chips.push(p.chiefcomplaint);
        if (p.arrival_time)    chips.push(`Arrived: ${p.arrival_time}`);
        chipsEl.innerHTML = chips.map(t => `<span class="uu-dm-chip">${t}</span>`).join('');
    } else if (chipsEl) {
        chipsEl.innerHTML = '';
    }

    setDateTimeValue('bedless-discharge-time', nowLocalIso());
    const destInput = document.getElementById('bedless-discharge-destination');
    if (destInput) destInput.value = '';
    toggleDestinationDetail('bedless-discharge-destination', 'bedless-discharge-destination-detail');

    const modal = document.getElementById('bedless-discharge-modal');
    if (modal) modal.style.display = 'flex';
}

function closeBedlessDischargeModal() {
    _bedlessDischargePatientId = null;
    const modal = document.getElementById('bedless-discharge-modal');
    if (modal) modal.style.display = 'none';
}

async function confirmBedlessDischarge() {
    const pid = _bedlessDischargePatientId;
    if (!pid) return;

    const departure_time = document.getElementById('bedless-discharge-time')?.value || null;
    const destination = composeDestination('bedless-discharge-destination', 'bedless-discharge-destination-detail');
    if (!destination) {
        showMessage('Please select a destination.', 'error');
        return;
    }

    const btn = document.getElementById('bedless-discharge-confirm-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Discharging…'; }

    try {
        const res = await fetch(`/api/unurgent/discharge/${pid}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ departure_time, destination }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Discharge failed');

        closeBedlessDischargeModal();
        showMessage(`Patient #${pid} discharged (${data.departure_time}).`, 'success');
        notifyDataChange('beds', `Patient #${pid} discharged (no bed)`);
        // ER UI Architecture Redesign — the Waiting/No-Bed lane is now part
        // of the same render pass as the bed lanes (loadBeds()), not a
        // separately-triggered fetch (the old loadBedlessSection()).
        await loadBeds();
    } catch (err) {
        showMessage(`Discharge error: ${err.message}`, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🏠 Confirm Discharge'; }
    }
}

// ── "Fit to Screen" kiosk mode ─────────────────────────────────────────────────

function toggleBedsFitScreen() {
    // Turns the whole Beds Display section into a fixed, full-viewport overlay
    // scaled to exactly fill the available height — no scrolling — for showing
    // live bed status on a wall-mounted monitor.
    bedsFitActive = !bedsFitActive;
    const section = document.getElementById('beds-display');
    const btn     = document.getElementById('beds-fit-btn');

    if (bedsFitActive) {
        section.classList.add('beds-fit-active');
        document.body.classList.add('beds-fit-locked');
        if (btn) { btn.classList.add('active'); btn.innerHTML = '✕ Exit Fit Screen'; }
        applyBedsFitScale();
        bedsFitResizeHandler = () => applyBedsFitScale();
        window.addEventListener('resize', bedsFitResizeHandler);
    } else {
        section.classList.remove('beds-fit-active');
        document.body.classList.remove('beds-fit-locked');
        if (btn) { btn.classList.remove('active'); btn.innerHTML = '⛶ Fit to Screen'; }
        const inner = document.getElementById('beds-fit-inner');
        if (inner) { inner.style.transform = ''; inner.style.width = ''; }
        if (bedsFitResizeHandler) {
            window.removeEventListener('resize', bedsFitResizeHandler);
            bedsFitResizeHandler = null;
        }
    }
}

function applyBedsFitScale() {
    // Scales #beds-fit-inner (stats + every ward's bed grid) up or down so its
    // rendered height exactly matches the space available in #beds-fit-scale.
    const outer = document.getElementById('beds-fit-scale');
    const inner = document.getElementById('beds-fit-inner');
    if (!outer || !inner) return;

    inner.style.transform = 'none';
    inner.style.width     = '100%';

    const availableHeight = outer.clientHeight;
    const naturalHeight   = inner.scrollHeight;
    if (!availableHeight || !naturalHeight) return;

    // Clamp so a near-empty ward list doesn't blow up absurdly large, and a
    // huge one doesn't shrink to illegible text.
    const scale = Math.max(0.3, Math.min(availableHeight / naturalHeight, 2));

    inner.style.width     = (100 / scale) + '%';
    inner.style.transform = `scale(${scale})`;
}

function exitBedsFitScreen() {
    // Called from navigation.js when the user leaves this section, so kiosk
    // mode never lingers over a different page.
    if (bedsFitActive) toggleBedsFitScreen();
}

// ── Bed detail modal ──────────────────────────────────────────────────────────

function openBedModal(bedId, bedNumber, bedStatus, patientId, bedType) {
    // Populate and show the bed detail modal; hide/show action buttons based on current bed status
    currentBedId     = bedId;
    currentPatientId = patientId;

    document.getElementById('modal-bed-number').textContent     = bedNumber;
    document.getElementById('modal-current-status').textContent = bedStatus;
    document.getElementById('modal-current-status').className   = bedStatus.toLowerCase().replace(/ /g, '-') + '-text';
    document.getElementById('modal-patient-id').textContent     = patientId != null ? '#' + patientId : '—';
    const typeEl = document.getElementById('modal-bed-type');
    if (typeEl) typeEl.textContent = bedType || 'normal';

    const isUnderRepair = bedStatus === 'Under Repair';
    const isOccupied    = bedStatus === 'Occupied';
    const isAvailable   = bedStatus === 'Available';

    // Assign form — only shown when the bed is empty and usable
    const assignSection = document.getElementById('modal-assign-section');
    if (assignSection) {
        assignSection.style.display = isAvailable ? 'block' : 'none';
        const input = document.getElementById('modal-assign-patient-input');
        if (input) input.value = '';
        const err = document.getElementById('modal-assign-error');
        if (err) err.textContent = '';
        const arrivalInput = document.getElementById('modal-assign-arrival-time');
        if (arrivalInput) setDateTimeValue('modal-assign-arrival-time', nowLocalIso());
    }

    // Release button — only meaningful when a patient is currently occupying the bed
    const releaseBtn = document.getElementById('modal-release-btn');
    if (releaseBtn) releaseBtn.style.display = isOccupied ? 'inline-flex' : 'none';

    // Change Bed button — only meaningful when a patient is currently occupying the bed
    const changeBedBtn = document.getElementById('modal-change-bed-btn');
    if (changeBedBtn) changeBedBtn.style.display = isOccupied ? 'inline-flex' : 'none';

    // "Mark as Under Repair" — only available when the bed is empty
    const repairBtn = document.getElementById('modal-repair-btn');
    if (repairBtn) repairBtn.style.display = isAvailable ? 'inline-flex' : 'none';

    // "Mark as Available" — only available when the bed is under repair
    const fixBtn = document.getElementById('modal-fix-btn');
    if (fixBtn) fixBtn.style.display = isUnderRepair ? 'inline-flex' : 'none';

    document.getElementById('bed-modal').style.display = 'block';
}

function closeBedModal() {
    document.getElementById('bed-modal').style.display = 'none';
    currentBedId     = null;
    currentPatientId = null;
}

async function assignPatientToBed() {
    // Read the patient ID from the assign form and POST to the beds API
    const input     = document.getElementById('modal-assign-patient-input');
    const errEl     = document.getElementById('modal-assign-error');
    const arrivalEl = document.getElementById('modal-assign-arrival-time');
    const patientId = parseInt(input?.value);

    if (!patientId || isNaN(patientId)) {
        if (errEl) errEl.textContent = 'Please enter a valid Patient ID.';
        return;
    }
    if (errEl) errEl.textContent = '';

    const body = { patient_id: patientId };
    if (arrivalEl && arrivalEl.value) body.bed_occupation_time = arrivalEl.value;

    try {
        const response = await fetch(`/api/beds/assign/${currentBedId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const result = await response.json();
        if (!response.ok) {
            if (errEl) errEl.textContent = result.detail || 'Failed to assign patient.';
            return;
        }
        showMessage(result.message, 'success');
        notifyDataChange('beds', `Patient #${patientId} assigned to bed #${currentBedId}`);
        closeBedModal();
        await loadBeds();  // refresh the grid to reflect the new occupancy
    } catch (error) {
        if (errEl) errEl.textContent = 'Network error. Please try again.';
    }
}

// ── Discharge modal (accessed from bed detail modal) ──────────────────────────

function openBedDischargeModal() {
    // Pre-fill departure time and show the discharge confirmation modal
    if (!currentBedId) return;
    const now = nowLocalIso();
    setDateTimeValue('bed-discharge-departure-time', now);
    document.getElementById('bed-discharge-destination').value = '';
    toggleDestinationDetail('bed-discharge-destination', 'bed-discharge-destination-detail');
    const patLabel = currentPatientId != null ? `Patient <strong>#${currentPatientId}</strong>` : 'the patient';
    document.getElementById('bed-discharge-info').innerHTML =
        `You are about to discharge ${patLabel} from bed <strong>#${currentBedId}</strong>.<br>
         The patient record will be saved to the log and removed from daily patients.`;
    const errEl = document.getElementById('bed-discharge-error');
    errEl.textContent  = '';
    errEl.style.display = 'none';
    const btn = document.getElementById('bed-discharge-confirm-btn');
    btn.disabled    = false;
    btn.textContent = 'Discharge Patient';
    document.getElementById('bed-discharge-modal').style.display = 'block';
}

function closeBedDischargeModal() {
    document.getElementById('bed-discharge-modal').style.display = 'none';
}

async function confirmBedDischarge() {
    // POST the departure time to the beds/discharge endpoint then refresh the grid
    const departureTime = document.getElementById('bed-discharge-departure-time').value;
    const destination   = composeDestination('bed-discharge-destination', 'bed-discharge-destination-detail');
    const errEl = document.getElementById('bed-discharge-error');
    if (!departureTime) {
        errEl.textContent  = 'Please set a departure time.';
        errEl.style.display = 'block';
        return;
    }
    if (!destination) {
        errEl.textContent  = 'Please select a destination.';
        errEl.style.display = 'block';
        return;
    }
    errEl.textContent  = '';
    errEl.style.display = 'none';
    const btn = document.getElementById('bed-discharge-confirm-btn');
    btn.disabled    = true;
    btn.textContent = 'Discharging…';
    try {
        const res  = await fetch(`/api/beds/discharge/${currentBedId}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ departure_time: departureTime, destination }),
        });
        const data = await res.json();
        if (!res.ok) {
            errEl.textContent  = data.detail || 'Failed to discharge patient.';
            errEl.style.display = 'block';
            btn.disabled    = false;
            btn.textContent = 'Discharge Patient';
        } else {
            const pid = currentPatientId;
            const bid = currentBedId;
            closeBedDischargeModal();
            closeBedModal();
            showMessage('Patient discharged and moved to log successfully.', 'success');
            notifyDataChange('beds', `Patient #${pid} discharged from bed #${bid}`);
            await loadBeds();
        }
    } catch (e) {
        errEl.textContent  = 'Network error. Please try again.';
        errEl.style.display = 'block';
        btn.disabled    = false;
        btn.textContent = 'Discharge Patient';
    }
}

async function setBedCondition(condition) {
    // Toggle the bed between Available and Under Repair
    if (!currentBedId) return;
    try {
        const response = await fetch(`/api/beds/condition/${currentBedId}`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ condition }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || 'Failed to update bed condition');
        showMessage(result.message, 'success');
        closeBedModal();
        await loadBeds();
    } catch (error) {
        showMessage(`Error: ${error.message}`, 'error');
    }
}

// Close modals when the user clicks on the dark overlay behind them
window.addEventListener('click', function(event) {
    if (event.target === document.getElementById('bed-modal'))            closeBedModal();
    if (event.target === document.getElementById('bed-discharge-modal'))  closeBedDischargeModal();
});

// Refresh beds display whenever any data changes and this section is open
onDataChange(function() {
    if (document.getElementById('beds-display')?.classList.contains('active')) {
        loadBeds();
    }
});
