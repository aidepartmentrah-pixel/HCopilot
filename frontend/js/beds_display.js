/**
 * beds_display.js — Beds Display section for HCopilot.
 *
 * Renders live bed occupancy as a ward-grouped visual grid.
 * Each bed card shows bed number, type, status, and assigned patient info.
 *
 * Responsibilities:
 *   loadBeds()             — fetch /api/beds/stats and /api/beds/list in parallel,
 *                            render stat cards and the ward-grouped bed grid.
 *   openBedModal(bedId)    — open the bed detail modal; fetches current patient
 *                            info and available doctors/nurses for assignment.
 *   assignPatient()        — POST /api/scheduling/assign to link a patient to this bed.
 *   releaseBed()           — POST /api/beds/release/{bedId} to free the bed.
 *   setCondition()         — POST /api/beds/condition/{bedId} to mark dirty/available.
 *   confirmDischarge()     — POST /api/scheduling/discharge/{stayId} to archive the
 *                            patient to LogPatients and release the bed.
 *
 * Global state:
 *   currentBedId     — bed_id of the bed open in the detail modal
 *   currentPatientId — patient_id currently on that bed (null if empty)
 */

let currentBedId     = null;  // bed currently open in the detail modal
let currentPatientId = null;  // patient currently on that bed (null if empty)

let bedsFitActive       = false;  // whether "Fit to Screen" kiosk mode is on
let bedsFitResizeHandler = null;  // bound resize listener, so it can be removed on exit

async function loadBeds() {
    // Fetch bed stats and full bed list in parallel, then render the visual grid grouped by ward
    const statsContainer = document.getElementById('beds-stats');
    const bedsContainer  = document.getElementById('beds-grid');

    try {
        const [statsResponse, bedsResponse] = await Promise.all([
            fetch('/api/beds/stats'),
            fetch('/api/beds/list')
        ]);
        const stats    = await statsResponse.json();
        const bedsData = await bedsResponse.json();

        // Render the stat cards row
        statsContainer.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-label">Total Beds</div>
                    <div class="stat-value">${stats.total_beds}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Occupied</div>
                    <div class="stat-value" style="color:#e74c3c">${stats.occupied}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Available</div>
                    <div class="stat-value" style="color:#27ae60">${stats.available}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Under Repair</div>
                    <div class="stat-value" style="color:#f59e0b">${stats.under_repair}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Occupancy Rate</div>
                    <div class="stat-value">${stats.occupancy_rate}%</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Total Wards</div>
                    <div class="stat-value">${stats.total_wards}</div>
                </div>
            </div>
        `;

        // Group beds by ward for section rendering; beds with no ward go to "Unassigned"
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

        // Build one ward section: header with mini-stats + visual bed grid
        const renderWardSection = (wardLabel, wardBeds) => {
            const occupied    = wardBeds.filter(b => b.bed_status === 'Occupied').length;
            const available   = wardBeds.filter(b => b.bed_status === 'Available').length;
            const underRepair = wardBeds.filter(b => b.bed_status === 'Under Repair').length;
            return `
                <div class="ward-section">
                    <div class="ward-header">
                        <h3>🏥 ${wardLabel}</h3>
                        <div class="ward-stats">
                            <span class="ward-stat occupied">🔴 ${occupied} Occupied</span>
                            <span class="ward-stat available">🟢 ${available} Available</span>
                            ${underRepair > 0 ? `<span class="ward-stat under-repair">🟡 ${underRepair} Under Repair</span>` : ''}
                            <span class="ward-stat total">📊 ${wardBeds.length} Total</span>
                        </div>
                    </div>
                    <div class="beds-visual-grid">
                        ${wardBeds.map(bed => {
                            const cssClass = bed.bed_status.toLowerCase().replace(/ /g, '-');
                            const btype    = bed.bed_type || 'normal';
                            const patTip = bed.patient_id != null
                                ? ` · ${bed.patient_name ? bed.patient_name + ' (#' + bed.patient_id + ')' : 'Patient #' + bed.patient_id}`
                                : '';
                            const tooltip  = `Bed ${bed.bed_number}` +
                                ` · Type: ${btype}` +
                                patTip +
                                (bed.bed_status === 'Under Repair' ? ' · Under Repair' : '');
                            const patientBlock = bed.patient_id != null ? (() => {
                            const nameLine = bed.patient_name
                                ? `<div class="bed-patient-name">${bed.patient_name}</div>`
                                : '';
                            const metaParts = [];
                            if (bed.patient_age != null) metaParts.push(bed.patient_age + ' y/o');
                            if (bed.patient_gender)      metaParts.push(bed.patient_gender);
                            const metaLine = metaParts.length
                                ? `<div class="bed-patient-meta">${metaParts.join(' · ')}</div>`
                                : '';
                            return `<div class="bed-patient-block">
                                        <div class="bed-patient-id">👤 #${bed.patient_id}</div>
                                        ${nameLine}${metaLine}
                                    </div>`;
                        })() : '';
                        return `
                            <div class="bed-item ${cssClass}"
                                 title="${tooltip}"
                                 onclick="openBedModal(${bed.bed_id}, '${bed.bed_number}', '${bed.bed_status}', ${bed.patient_id}, '${btype}')"
                                 data-bed-id="${bed.bed_id}">
                                <div class="bed-graphic">
                                    <div class="bed-pillow"></div>
                                    <div class="bed-mattress"></div>
                                    <div class="bed-frame"></div>
                                </div>
                                <div class="bed-info">
                                    <div class="bed-number">${bed.bed_number}</div>
                                    <div class="bed-status">${bed.bed_status}</div>
                                    <div class="bed-type-badge type-${btype.toLowerCase()}">${btype}</div>
                                    ${patientBlock}
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>`;
        };

        let html = wardIds.map(w => {
            const name = bedsByWard[w][0]?.ward_name || ('Ward ' + w);
            return renderWardSection(name, bedsByWard[w]);
        }).join('');
        if (unassigned.length > 0) html += renderWardSection('Unassigned', unassigned);
        bedsContainer.innerHTML = html;

        if (bedsFitActive) applyBedsFitScale();  // re-fit after live data changes the content height

    } catch (error) {
        statsContainer.innerHTML = `<div class="error-state"><p>Error loading bed statistics: ${error.message}</p></div>`;
        bedsContainer.innerHTML  = `<div class="error-state"><div class="error-icon">❌</div><h3>Error Loading Beds</h3><p>${error.message}</p></div>`;
        showMessage(`Error loading beds: ${error.message}`, 'error');
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
        if (arrivalInput) arrivalInput.value = nowLocalIso();
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
    document.getElementById('bed-discharge-departure-time').value = now;
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
