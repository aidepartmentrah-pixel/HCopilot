// ============================================================
// Simulation — patient intake simulator + OR bed/staff scheduler
//
// State lives entirely in this module; nothing is shared with
// other sections.  All API calls go through the /api/simulation
// prefix.
//
// Two-panel layout:
//   Left  — Patient Intake: draw random patients from the dataset
//           and confirm adding them to DailyPatients
//   Right — OR Scheduler: compute and display assignment suggestions
//           for every unassigned patient; user confirms or rejects each
// ============================================================

const SIM_BASE = '/api/simulation';

// ── Module state ─────────────────────────────────────────────────────────────

let simPendingSample      = null;
let _simPendingNotifications = [];  // queued while the simulation section is not active   // last sampled patient (shown in modal, not yet confirmed)
let simRejectedCards      = new Set(); // patient_ids whose suggestion was rejected this run
let simBaseScoreOverrides = {};     // { patient_id_str: float } — user-edited base scores
let simStrictNurses       = false;
let simSuggestionsCache   = [];     // last OR response suggestions
let simLastORData         = null;   // full last OR response (needed to re-render without a new fetch)
let simIcuOccupants       = [];     // patients currently in an ICU bed (for manual reassignment)
let _simShifts            = [];     // loaded from /api/staff/shifts/list
let _simGroups            = [];     // loaded from /api/staff/groups/list

// ── Clock state ───────────────────────────────────────────────────────────────
let _simClockTickInterval  = null;  // 1-second timer for the HH:MM display
let _simClockFetchInterval = null;  // 60-second timer for shift/group from backend

// ── Edit-panel state ──────────────────────────────────────────────────────────
let simEditPanelOpen    = new Set(); // patientIds whose inline edit panel is currently open
let simCardOverrides    = {};        // { patientId: { bed_id?, doctor_id?, nurse1_id?, nurse2_id?, skip_doctor?, skip_nurses? } }
let _simEditBeds        = [];        // available beds — loaded lazily on first edit open
let _simEditDoctors     = [];        // all doctors — loaded lazily
let _simEditNurses      = [];        // all nurses — loaded lazily
let _simEditDataLoaded  = false;

// ── Data-change listener — registered once at script load ─────────────────────
// Queues notifications when the section is hidden; flushes + refreshes on entry.

onDataChange(({ type, message }) => {
    const section = document.getElementById('simulation');
    if (section && section.classList.contains('active')) {
        _simShowNotification(message);
        refreshSimWaitingList();
        simRunOR();
    } else {
        _simPendingNotifications.push(message);
    }
});

// ── Initialiser (called by navigation.js on section entry) ────────────────────

function toggleSimIntake(show) {
    const panel  = document.getElementById('sim-intake-panel');
    const layout = document.getElementById('sim-layout');
    if (panel)  panel.style.display  = show ? '' : 'none';
    if (layout) layout.classList.toggle('intake-visible', show);
}

function initSimulation() {
    simRejectedCards      = new Set();
    simBaseScoreOverrides = {};
    simSuggestionsCache   = [];
    simLastORData         = null;
    simEditPanelOpen      = new Set();
    simCardOverrides      = {};
    _simEditDataLoaded    = false;
    _simEditBeds          = [];
    _simEditDoctors       = [];
    _simEditNurses        = [];

    const strictCb = document.getElementById('sim-strict-nurses');
    if (strictCb) {
        strictCb.removeEventListener('change', simRunOR);
        strictCb.addEventListener('change', simRunOR);
    }

    if (_simPendingNotifications.length > 0) {
        const pending = _simPendingNotifications.splice(0);
        pending.forEach(msg => _simShowNotification(msg));
    }

    _simStartClock();

    simLoadShiftsGroups().then(() => {
        refreshSimWaitingList().then(() => simRunOR());
    });
}

async function simLoadShiftsGroups() {
    try {
        const [sRes, gRes] = await Promise.all([
            fetch('/api/staff/shifts/list'),
            fetch('/api/staff/groups/list')
        ]);
        _simShifts = (await sRes.json()).shifts || [];
        _simGroups = (await gRes.json()).groups || [];
    } catch (_) {
        _simShifts = [];
        _simGroups = [];
    }

    const shiftSel = document.getElementById('sim-shift-select');
    const groupSel = document.getElementById('sim-group-select');
    if (!shiftSel || !groupSel) return;

    const _shiftIcon = n => {
        const l = (n || '').toLowerCase();
        return l.includes('morning') ? '☀️' : l.includes('evening') ? '🌇' : l.includes('night') ? '🌙' : l.includes('day') ? '🌤️' : '🕐';
    };

    shiftSel.innerHTML = '<option value="">Auto-detect</option>';
    _simShifts.forEach(s => {
        shiftSel.innerHTML += `<option value="${s.name}">${_shiftIcon(s.name)} ${s.name}</option>`;
    });

    groupSel.innerHTML = '<option value="">Auto-detect</option>';
    _simGroups.forEach(g => {
        groupSel.innerHTML += `<option value="${g.name}">${g.name}</option>`;
    });
}

function simOnShiftGroupChange() {
    // Mirror the simulation selects back to the scheduling filter bar so both
    // sections always share the same active shift/group context.
    const shiftVal = document.getElementById('sim-shift-select')?.value || '';
    const groupVal = document.getElementById('sim-group-select')?.value || '';
    const schedShiftSel = document.getElementById('sch-sf-shift');
    const schedGroupSel = document.getElementById('sch-sf-group');
    if (schedShiftSel) schedShiftSel.value = shiftVal;
    if (schedGroupSel) schedGroupSel.value = groupVal;
    simRunOR();
}

function _simShowNotification(message) {
    const el = document.getElementById('sim-notifications');
    if (!el) return;
    const note = document.createElement('div');
    note.className = 'sim-notification';
    note.innerHTML = `<span>🔔 ${message}</span><button class="sim-notif-close" onclick="this.parentElement.remove()">×</button>`;
    el.prepend(note);
    setTimeout(() => { if (note.parentElement) note.remove(); }, 8000);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _simFmt(v, fallback = '—') {
    return (v !== null && v !== undefined) ? v : fallback;
}

function _simWaitLabel(minutes) {
    if (minutes < 1)  return 'just arrived';
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function _simAcuityBadge(acuity, effective_acuity, was_null) {
    const label = was_null
        ? `Acuity: null → treated as 1`
        : (acuity !== null && acuity !== undefined ? `Acuity ${acuity}` : `Acuity —`);
    let cls = 'badge-normal';
    if (effective_acuity <= 2) cls = 'badge-critical';
    else if (effective_acuity === 5) cls = 'badge-low';
    return `<span class="sim-acuity-badge ${cls}">${label}</span>`;
}

function _laneCssClass(lane, is_overflow) {
    if (is_overflow) return 'lane-overflow';
    if (lane === '1-2') return 'lane-critical';
    if (lane === '3-4') return 'lane-normal';
    return 'lane-low';
}

// ── Waiting list (left panel) ──────────────────────────────────────────────────

async function refreshSimWaitingList() {
    const el = document.getElementById('sim-waiting-list');
    if (!el) return;
    el.innerHTML = '<div class="sim-loading"><div class="spinner"></div>Loading...</div>';

    try {
        // Fetch unassigned patients (excluding bed-assigned and unurgent-routed)
        const [dpRes, pbRes, uuRes] = await Promise.all([
            fetch('/api/patients/list'),
            fetch('/api/relations/patient_bed'),
            fetch('/api/unurgent/list'),
        ]);
        const dp  = await dpRes.json();
        const pb  = await pbRes.json();
        const uu  = await uuRes.json();

        const assignedIds = new Set((pb.rows || []).map(r => r.patient_id));
        const unurgentIds = new Set((uu.patients || []).map(p => p.subject_id));
        const waiting = (dp.patients || []).filter(p =>
            !assignedIds.has(p.patient_id) && !unurgentIds.has(p.patient_id)
        );

        if (!waiting.length) {
            el.innerHTML = '<div class="sim-empty-state">No patients waiting for a bed.</div>';
            return;
        }

        el.innerHTML = waiting.map(p => _simWaitingCard(p)).join('');

    } catch (err) {
        el.innerHTML = `<div class="sim-empty-state" style="color:#dc2626">Error: ${err.message}</div>`;
    }
}

function _simWaitingCard(p) {
    const acuity  = p.acuity;
    const eff     = acuity === null || acuity === undefined ? 1 : Math.round(acuity);
    const wasNull = acuity === null || acuity === undefined;
    const wait    = _waitMinutes(p.arrival_time);

    let laneCls = 'lane-normal';
    if (eff <= 2 || wasNull) laneCls = 'lane-critical';
    else if (eff === 5) laneCls = 'lane-low';

    // Editable base-score row only for acuity 3 or 4
    const showScore = (eff === 3 || eff === 4) && !wasNull;
    const currentOverride = simBaseScoreOverrides[String(p.patient_id)];
    const defaultBase = eff;   // 3.0 or 4.0
    const baseVal = currentOverride !== undefined ? currentOverride : defaultBase;
    const currentScore = (baseVal - wait / 60).toFixed(2);

    const scoreRow = showScore ? `
        <div class="sim-score-row">
            <span class="sim-score-label">Base score:</span>
            <input class="sim-score-input"
                   type="number" step="0.1" min="0" max="10"
                   value="${baseVal}"
                   onchange="simUpdateBaseScore(${p.patient_id}, this.value)"
                   title="Edit base priority (default = acuity level)">
            <span class="sim-score-display">→ current score: ${currentScore}</span>
        </div>` : '';

    const nameInfo = p.name
        ? `<div class="sim-patient-name">${p.name}${p.age != null ? ', ' + p.age + ' y/o' : ''}${p.gender ? ' · ' + p.gender : ''}</div>`
        : '';

    return `
        <div class="sim-waiting-card ${laneCls}" id="sim-waiting-${p.patient_id}">
            <div class="sim-card-top">
                ${_simAcuityBadge(acuity, eff, wasNull)}
                <span class="sim-patient-id">Patient #${p.patient_id}</span>
                <span class="sim-wait-label">⏱ ${_simWaitLabel(wait)}</span>
            </div>
            ${nameInfo}
            <div class="sim-complaint">${_simFmt(p.chiefcomplaint, 'No complaint recorded')}</div>
            ${scoreRow}
        </div>`;
}

function _waitMinutes(arrivalTime) {
    if (!arrivalTime) return 0;
    const arr  = new Date(arrivalTime);
    const diff = (Date.now() - arr.getTime()) / 60000;
    return Math.max(0, diff);
}

function simUpdateBaseScore(patientId, rawVal) {
    const v = parseFloat(rawVal);
    if (!isNaN(v)) {
        simBaseScoreOverrides[String(patientId)] = v;
    } else {
        delete simBaseScoreOverrides[String(patientId)];
    }
    // Refresh the score display inline without a full re-render
    refreshSimWaitingList();
}

// ── Patient Intake — sample & confirm ─────────────────────────────────────────

async function simSamplePatient() {
    const btn = document.getElementById('sim-next-btn');
    if (btn) btn.disabled = true;

    try {
        const res  = await fetch(`${SIM_BASE}/sample-patient`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to sample patient');

        simPendingSample = data;
        _openSimPatientModal(data);

    } catch (err) {
        showMessage(`Simulation: ${err.message}`, 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

function _openSimPatientModal(p) {
    document.getElementById('sim-modal-patient-id').textContent   = `#${p.new_patient_id}`;
    document.getElementById('sim-modal-stay-id').textContent      = `#${p.new_stay_id}`;
    document.getElementById('sim-modal-source-id').textContent    = `(from dataset record #${p.source_subject_id})`;
    document.getElementById('sim-modal-acuity').textContent       = p.acuity !== null && p.acuity !== undefined
        ? p.acuity : '— (null, will be treated as 1)';
    document.getElementById('sim-modal-complaint').textContent    = _simFmt(p.chiefcomplaint, '—');
    document.getElementById('sim-modal-temp').textContent         = _simFmt(p.temperature, '—');
    document.getElementById('sim-modal-hr').textContent           = _simFmt(p.heartrate, '—');
    document.getElementById('sim-modal-rr').textContent           = _simFmt(p.resprate, '—');
    document.getElementById('sim-modal-o2').textContent           = _simFmt(p.o2sat, '—');
    document.getElementById('sim-modal-sbp').textContent          = _simFmt(p.sbp, '—');
    document.getElementById('sim-modal-dbp').textContent          = _simFmt(p.dbp, '—');
    document.getElementById('sim-modal-pain').textContent         = _simFmt(p.pain, '—');

    const warnEl = document.getElementById('sim-modal-null-warn');
    if (warnEl) warnEl.style.display = p.acuity_was_null ? '' : 'none';

    // Acuity-5 banner: inform user this patient will appear in waiting list first,
    // then the OR scheduler will suggest the unurgent care path
    const uu5El = document.getElementById('sim-modal-unurgent-warn');
    const isAcuity5 = p.acuity !== null && p.acuity !== undefined && Math.round(p.acuity) === 5;
    if (uu5El) uu5El.style.display = isAcuity5 ? '' : 'none';

    document.getElementById('sim-patient-modal').style.display = 'flex';
}

function closeSimPatientModal() {
    document.getElementById('sim-patient-modal').style.display = 'none';
    simPendingSample = null;
}

async function simConfirmPatient() {
    if (!simPendingSample) return;
    const p   = simPendingSample;
    const btn = document.getElementById('sim-modal-confirm-btn');
    btn.disabled = true;
    btn.textContent = 'Adding…';

    try {
        const res = await fetch(`${SIM_BASE}/confirm-patient`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subject_id:    p.new_patient_id,
                stay_id:       p.new_stay_id,
                temperature:   p.temperature,
                heartrate:     p.heartrate,
                resprate:      p.resprate,
                o2sat:         p.o2sat,
                sbp:           p.sbp,
                dbp:           p.dbp,
                pain:          p.pain ? String(p.pain) : null,
                acuity:        p.acuity,
                chiefcomplaint:p.chiefcomplaint,
            }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to add patient');

        closeSimPatientModal();
        showMessage(`Patient #${p.new_patient_id} added to daily patients.`, 'success');

        // Refresh both panels; always auto-run OR after a new patient is added
        await refreshSimWaitingList();
        await simRunOR();

    } catch (err) {
        showMessage(`Simulation: ${err.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '✓ Confirm & Add';
    }
}

// ── OR Scheduler — suggest & confirm ──────────────────────────────────────────

async function simRunOR() {
    const btn = document.getElementById('sim-run-btn');
    if (btn) btn.disabled = true;

    const orBody = document.getElementById('sim-or-body');
    orBody.innerHTML = '<div class="sim-loading"><div class="spinner"></div>Running OR scheduler…</div>';

    simStrictNurses = document.getElementById('sim-strict-nurses').checked;

    const overrides = { ...simBaseScoreOverrides };

    // Read manual shift/group override — simulation selects take priority,
    // then fall back to the scheduling section's staff filter (shared source of truth),
    // then let the backend auto-detect from the current time / weekday.
    const shiftSel = document.getElementById('sim-shift-select');
    const groupSel = document.getElementById('sim-group-select');
    const schedShiftSel = document.getElementById('sch-sf-shift');
    const schedGroupSel = document.getElementById('sch-sf-group');

    const simShiftVal  = shiftSel?.value  || '';
    const simGroupVal  = groupSel?.value  || '';
    const schedShiftVal = schedShiftSel?.value || '';
    const schedGroupVal = schedGroupSel?.value || '';

    // Priority: simulation override → scheduling filter → auto-detect (null)
    const shiftOverride = simShiftVal  || schedShiftVal  || null;
    const groupOverride = simGroupVal || schedGroupVal || null;

    const _source = simShiftVal || simGroupVal   ? 'simulation override'
                  : schedShiftVal || schedGroupVal ? 'scheduling filter'
                  : 'auto-detected';

    const hint = document.getElementById('sim-sg-hint');
    if (hint) hint.textContent = `(${_source})`;

    try {
        const res = await fetch(`${SIM_BASE}/or-suggest`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                strict_nurses:        simStrictNurses,
                base_score_overrides: overrides,
                shift_override:       shiftOverride,
                group_override:       groupOverride,
            }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'OR scheduler failed');

        simSuggestionsCache = data.suggestions || [];
        simLastORData       = data;
        simIcuOccupants     = data.icu_occupants || [];
        _renderORSuggestions(data);

    } catch (err) {
        orBody.innerHTML = `<div class="sim-empty-state" style="color:#dc2626">Error: ${err.message}</div>`;
    } finally {
        if (btn) btn.disabled = false;
    }
}

function _renderORSuggestions(data) {
    const orBody = document.getElementById('sim-or-body');
    orBody.innerHTML = '';

    // Shift tag — show all active shifts (may be >1 when windows overlap)
    const shiftTag   = document.createElement('div');
    const _allShifts = (data.current_shifts && data.current_shifts.length)
        ? data.current_shifts
        : [data.current_shift || 'Unknown'];
    const _allGroups = (data.current_groups && data.current_groups.length)
        ? data.current_groups
        : [data.current_group || ''];
    const _shiftLabel = _allShifts.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' & ');
    const _groupLabel = _allGroups.map(g => g.charAt(0).toUpperCase() + g.slice(1)).join(' & ');
    shiftTag.className   = `sim-shift-tag ${data.current_shift || ''}`;
    shiftTag.textContent = `${_shiftLabel} shift · ${_groupLabel}`;
    orBody.appendChild(shiftTag);

    if (data.no_waiting) {
        orBody.innerHTML += '<div class="sim-empty-state">All patients have been assigned (beds or unurgent path).</div>';
        return;
    }

    // Emergency banner when Ward 1 is full
    if (data.ward1_full) {
        orBody.innerHTML += `
            <div class="sim-emergency-banner">
                <div class="sim-emergency-icon">🚨</div>
                <div>
                    <div class="sim-emergency-text">Ward 1 (Critical Ward) is FULL</div>
                    <div class="sim-emergency-sub">
                        Critical patients (acuity 1/2) have been redirected to overflow beds
                        in other wards.  Consider discharging or transferring Ward 1 patients.
                    </div>
                </div>
            </div>`;
    }

    // Emergency banner when no ICU bed is free for a waiting critical patient
    if (data.icu_shortage) {
        orBody.innerHTML += `
            <div class="sim-emergency-banner sim-icu-banner">
                <div class="sim-emergency-icon">🛏️</div>
                <div>
                    <div class="sim-emergency-text">No ICU bed available</div>
                    <div class="sim-emergency-sub">
                        A critical patient needs an ICU bed but none are free. Reassign a
                        current ICU occupant to another bed, or add a temporary chariot bed
                        — see the affected suggestion below.
                    </div>
                </div>
            </div>`;
    }

    const visible = data.suggestions.filter(s => !simRejectedCards.has(s.patient_id));

    // Restore bar — sits next to the checkbox, shown when suggestions are hidden
    const restoreContainer = document.getElementById('sim-restore-container');
    if (restoreContainer) {
        if (simRejectedCards.size > 0) {
            restoreContainer.innerHTML = `
                <div class="sim-restore-bar">
                    <span class="sim-restore-count">${simRejectedCards.size} hidden</span>
                    <button class="sim-restore-btn" onclick="simClearRejections()">↩ Restore</button>
                </div>`;
        } else {
            restoreContainer.innerHTML = '';
        }
    }

    if (!visible.length) {
        orBody.innerHTML += '<div class="sim-empty-state">All suggestions have been handled.</div>';
        return;
    }

    visible.forEach(s => {
        orBody.appendChild(_buildSuggestionCard(s));
    });
}

function _buildSuggestionCard(s) {
    // ── Unurgent path card (acuity 5) ────────────────────────────────────────
    if (s.suggest_unurgent) {
        return _buildUnurgentCard(s);
    }

    const laneCls = _laneCssClass(s.acuity_lane, s.is_overflow);
    const card    = document.createElement('div');
    card.className = `sim-suggestion-card ${laneCls}`;
    card.id        = `sim-sug-${s.patient_id}`;

    const laneLabel = s.acuity_lane === '1-2' ? 'CRITICAL' :
                      s.acuity_lane === '3-4' ? 'Standard' : 'Low priority';
    const acuityDisplay = (s.acuity !== null && s.acuity !== undefined)
        ? `Acuity ${s.acuity}`
        : 'Acuity: null→1';
    const scoreDisplay = s.priority_score !== null
        ? ` | Score: ${s.priority_score}` : '';
    const waitDisplay = _simWaitLabel(s.waiting_minutes);

    const overflowBadge = s.is_overflow
        ? '<span class="sim-overflow-badge">OVERFLOW</span>' : '';
    const noBedBadge = s.icu_unavailable
        ? '<span class="sim-no-bed-badge">NO ICU BED</span>'
        : (s.no_bed_available ? '<span class="sim-no-bed-badge">NO BED</span>' : '');
    const warnBadge = (s.senior_fallback || s.nurse_strict_fallback)
        ? '<span class="sim-warn-badge">⚠ WARN</span>' : '';

    const bedChip = s.bed_id !== null
        ? `<span class="sim-resource-chip chip-bed">🛏 ${s.bed_number} [${s.bed_type || 'normal'}] · ${s.ward_name}</span>`
        : `<span class="sim-resource-chip chip-none">🛏 No bed</span>`;

    const docChip = s.doctor_id !== null
        ? `<span class="sim-resource-chip chip-doctor">👨‍⚕️ ${s.doctor_name ? s.doctor_name : 'Dr.'} <span class="chip-id">#${s.doctor_id}</span> (${s.doctor_type})</span>`
        : `<span class="sim-resource-chip chip-none">👨‍⚕️ No doctor</span>`;

    const n1Chip = s.nurse1_id !== null
        ? `<span class="sim-resource-chip chip-nurse">👩‍⚕️ ${s.nurse1_name ? s.nurse1_name : '#' + s.nurse1_id} (${s.nurse1_role})</span>`
        : `<span class="sim-resource-chip chip-none">👩‍⚕️ Nurse 1: —</span>`;
    const n2Chip = s.nurse2_id !== null
        ? `<span class="sim-resource-chip chip-nurse">👩‍⚕️ ${s.nurse2_name ? s.nurse2_name : '#' + s.nurse2_id} (${s.nurse2_role})</span>`
        : '';

    const reasons = (s.reasons || []).map(r => {
        const isWarn  = r.includes('WARN') || r.includes('fallback') || r.includes('OVERFLOW');
        const isError = r.includes('No ') && (r.includes('bed') || r.includes('doctor') || r.includes('nurse'));
        const cls     = isError ? 'reason-error' : isWarn ? 'reason-warn' : '';
        return `<li class="${cls}">${r}</li>`;
    }).join('');

    const confirmDisabled = s.no_bed_available ? 'disabled' : '';
    const confirmTitle    = s.no_bed_available ? 'title="Cannot confirm — no bed available"' : '';
    const icuPanel = s.icu_unavailable ? _buildIcuDecisionPanel(s.patient_id) : '';

    const nameInfo = s.name
        ? `<div class="sim-patient-name">${s.name}${s.age != null ? ', ' + s.age + ' y/o' : ''}${s.gender ? ' · ' + s.gender : ''}</div>`
        : '';

    card.innerHTML = `
        <div class="sim-sug-header">
            <span class="sim-sug-title">
                [${laneLabel}] Patient #${s.patient_id} · ${acuityDisplay}${scoreDisplay}
            </span>
            <span class="sim-wait-label">⏱ ${waitDisplay}</span>
            ${overflowBadge}${noBedBadge}${warnBadge}
        </div>
        ${nameInfo}
        <div class="sim-sug-body">
            <div class="sim-resource-row">
                ${bedChip}${docChip}${n1Chip}${n2Chip}
            </div>
            <ul class="sim-reasons">${reasons}</ul>
            ${icuPanel}
        </div>
        <!-- Inline edit panel (hidden until user clicks Edit) -->
        <div class="sim-edit-panel" id="sim-ep-${s.patient_id}" style="display:none">
            <div class="sim-ep-header">
                <span class="sim-ep-title">✏️ Customize before confirming</span>
                <span class="sim-ep-hint">Select "— assign later —" to skip a resource now</span>
            </div>
            <div class="sim-ep-grid">
                <div class="sim-ep-field">
                    <label class="sim-ep-label">🛏️ Bed</label>
                    <select class="sim-ep-select" id="sim-ep-bed-${s.patient_id}"
                            onchange="simSetOverride(${s.patient_id}, 'bed_id', this.value)">
                        <option value="">Loading…</option>
                    </select>
                </div>
                <div class="sim-ep-field">
                    <label class="sim-ep-label">👨‍⚕️ Doctor</label>
                    <select class="sim-ep-select" id="sim-ep-doc-${s.patient_id}"
                            onchange="simSetOverride(${s.patient_id}, 'doc_select', this.value)">
                        <option value="">Loading…</option>
                    </select>
                </div>
                <div class="sim-ep-field">
                    <label class="sim-ep-label">👩‍⚕️ Nurse 1</label>
                    <select class="sim-ep-select" id="sim-ep-n1-${s.patient_id}"
                            onchange="simSetOverride(${s.patient_id}, 'n1_select', this.value)">
                        <option value="">Loading…</option>
                    </select>
                </div>
                <div class="sim-ep-field">
                    <label class="sim-ep-label">👩‍⚕️ Nurse 2</label>
                    <select class="sim-ep-select" id="sim-ep-n2-${s.patient_id}"
                            onchange="simSetOverride(${s.patient_id}, 'n2_select', this.value)">
                        <option value="">Loading…</option>
                    </select>
                </div>
            </div>
        </div>
        <div class="sim-sug-footer">
            <span class="sim-sug-time-note">🕐 Bed time auto-recorded on confirm</span>
            <button class="sim-edit-btn" id="sim-edit-btn-${s.patient_id}"
                    onclick="simToggleEditPanel(${s.patient_id})">
                ✏️ Edit
            </button>
            <button class="sim-reject-btn"
                    onclick="simRejectSuggestion(${s.patient_id})">
                ✗ Reject
            </button>
            <button class="sim-confirm-btn" ${confirmDisabled} ${confirmTitle}
                    id="sim-confirm-btn-${s.patient_id}"
                    onclick="simConfirmSuggestion(${s.patient_id})">
                ✓ Confirm
            </button>
        </div>`;

    return card;
}

function _buildUnurgentCard(s) {
    const card = document.createElement('div');
    card.className = 'sim-suggestion-card sim-unurgent-card';
    card.id        = `sim-sug-${s.patient_id}`;

    const waitDisplay = _simWaitLabel(s.waiting_minutes);
    const acuityDisplay = s.acuity != null ? `Acuity ${s.acuity}` : 'Acuity: null→1';
    const nameInfo = s.name
        ? `<div class="sim-patient-name">${s.name}${s.age != null ? ', ' + s.age + ' y/o' : ''}${s.gender ? ' · ' + s.gender : ''}</div>`
        : '';

    const docChip = s.doctor_id !== null
        ? `<span class="sim-resource-chip chip-doctor">👨‍⚕️ ${s.doctor_name ? s.doctor_name : 'Dr.'} <span class="chip-id">#${s.doctor_id}</span> (${s.doctor_type})</span>`
        : `<span class="sim-resource-chip chip-none">👨‍⚕️ No doctor assigned</span>`;
    const n1Chip = s.nurse1_id !== null
        ? `<span class="sim-resource-chip chip-nurse">👩‍⚕️ ${s.nurse1_name ? s.nurse1_name : '#' + s.nurse1_id} (${s.nurse1_role})</span>`
        : '';
    const n2Chip = s.nurse2_id !== null
        ? `<span class="sim-resource-chip chip-nurse">👩‍⚕️ ${s.nurse2_name ? s.nurse2_name : '#' + s.nurse2_id} (${s.nurse2_role})</span>`
        : '';

    const reasons = (s.reasons || []).map(r =>
        `<li>${r}</li>`
    ).join('');

    card.innerHTML = `
        <div class="sim-sug-header">
            <span class="sim-sug-title">
                🟢 [NON-URGENT] Patient #${s.patient_id} · ${acuityDisplay}
            </span>
            <span class="sim-wait-label">⏱ ${waitDisplay}</span>
            <span class="sim-unurgent-badge">UNURGENT PATH</span>
        </div>
        ${nameInfo}
        <div class="sim-unurgent-path-banner">
            <span class="sim-unurgent-path-icon">🏥</span>
            <div>
                <div class="sim-unurgent-path-title">Unurgent Treatment Path</div>
                <div class="sim-unurgent-path-sub">No bed required — patient will be treated in the unurgent care area.</div>
            </div>
        </div>
        <div class="sim-sug-body">
            <div class="sim-resource-row">${docChip}${n1Chip}${n2Chip}</div>
            <ul class="sim-reasons">${reasons}</ul>
        </div>
        <div class="sim-sug-footer">
            <button class="sim-reject-btn"
                    onclick="simRejectSuggestion(${s.patient_id})">
                ✗ Reject
            </button>
            <button class="sim-confirm-unurgent-btn"
                    onclick="simConfirmUnurgent(${s.patient_id})">
                → Send to Unurgent Path
            </button>
        </div>`;

    return card;
}

function _buildIcuDecisionPanel(patientId) {
    const occupantRows = simIcuOccupants.map(o => {
        const nameParts = [];
        if (o.patient_name) nameParts.push(o.patient_name);
        if (o.patient_age != null) nameParts.push(o.patient_age + ' y/o');
        if (o.patient_gender) nameParts.push(o.patient_gender);
        const identity = nameParts.length
            ? `<span class="sim-icu-pat-name">${nameParts.join(' · ')}</span>`
            : '';
        return `
        <div class="sim-icu-occupant-row">
            <div class="sim-icu-pat-info">
                <span class="sim-icu-pat-id">Patient #${o.patient_id}</span>
                ${identity}
                <span class="sim-icu-pat-bed">Bed ${o.bed_number} · ${o.ward_name}</span>
            </div>
            <button class="sim-icu-move-btn"
                    onclick="openChangeBedModal(${o.patient_id}, ${o.bed_id}, '${o.bed_number}')">
                🔄 Move
            </button>
        </div>`;
    }).join('');

    return `
        <div class="sim-icu-decision-panel">
            <div class="sim-icu-decision-title">No ICU bed free — choose one:</div>
            ${occupantRows || '<div class="sim-icu-empty">No patients currently in an ICU bed.</div>'}
            <div class="sim-icu-decision-or">— or —</div>
            <button class="sim-icu-chariot-btn" onclick="simConfirmWithChariot(${patientId})">
                🛒 Add a temporary chariot bed
            </button>
        </div>`;
}

async function simConfirmWithChariot(patientId) {
    const sug = simSuggestionsCache.find(s => s.patient_id === patientId);
    if (!sug) return;

    const btn = document.querySelector(`#sim-sug-${patientId} .sim-icu-chariot-btn`);
    if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }

    try {
        const res = await fetch(`${SIM_BASE}/or-confirm`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                patient_id:  sug.patient_id,
                stay_id:     sug.stay_id,
                use_chariot: true,
                doctor_id:   sug.doctor_id  || null,
                nurse1_id:   sug.nurse1_id  || null,
                nurse2_id:   sug.nurse2_id  || null,
            }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to add chariot bed');

        showMessage(`Patient #${patientId} → temporary chariot bed (${data.message}).`, 'success');
        notifyDataChange('beds', data.message);

        simSuggestionsCache = simSuggestionsCache.filter(s => s.patient_id !== patientId);
        await refreshSimWaitingList();
        await simRunOR();

    } catch (err) {
        showMessage(`Simulation: ${err.message}`, 'error');
        if (btn) { btn.disabled = false; btn.textContent = '🛒 Add a temporary chariot bed'; }
    }
}

async function simConfirmSuggestion(patientId) {
    const sug = simSuggestionsCache.find(s => s.patient_id === patientId);
    if (!sug) return;

    // Merge user overrides on top of the OR suggestion
    const ov = simCardOverrides[patientId] || {};
    const bedId    = ov.bed_id    !== undefined ? ov.bed_id    : sug.bed_id;
    const doctorId = ov.skip_doctor   ? null
                   : ov.doctor_id !== undefined ? ov.doctor_id : (sug.doctor_id  || null);
    const nurse1Id = ov.skip_nurses   ? null
                   : ov.nurse1_id !== undefined ? ov.nurse1_id : (sug.nurse1_id  || null);
    const nurse2Id = ov.skip_nurses   ? null
                   : ov.nurse2_id !== undefined ? ov.nurse2_id : (sug.nurse2_id  || null);

    const btn = document.getElementById(`sim-confirm-btn-${patientId}`);
    if (btn) { btn.disabled = true; btn.textContent = 'Confirming…'; }

    try {
        const res = await fetch(`${SIM_BASE}/or-confirm`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                patient_id: sug.patient_id,
                stay_id:    sug.stay_id,
                bed_id:     bedId,
                doctor_id:  doctorId,
                nurse1_id:  nurse1Id,
                nurse2_id:  nurse2Id,
            }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Confirm failed');

        // Determine which bed was actually used for the success message
        const usedBed = ov.bed_id !== undefined
            ? (_simEditBeds.find(b => b.bed_id === bedId)?.bed_number || `#${bedId}`)
            : sug.bed_number;
        const usedWard = ov.bed_id !== undefined
            ? (_simEditBeds.find(b => b.bed_id === bedId)?.ward_name || '')
            : sug.ward_name;

        showMessage(
            `Patient #${patientId} → Bed ${usedBed}${usedWard ? ' (' + usedWard + ')' : ''} confirmed.`,
            'success'
        );

        delete simCardOverrides[patientId];
        simEditPanelOpen.delete(patientId);
        simSuggestionsCache = simSuggestionsCache.filter(s => s.patient_id !== patientId);
        await refreshSimWaitingList();
        await simRunOR();

    } catch (err) {
        showMessage(`Simulation: ${err.message}`, 'error');
        if (btn) { btn.disabled = false; btn.textContent = '✓ Confirm'; }
    }
}

async function simConfirmUnurgent(patientId) {
    const sug = simSuggestionsCache.find(s => s.patient_id === patientId);
    if (!sug) return;

    const btn = document.querySelector(`#sim-sug-${patientId} .sim-confirm-unurgent-btn`);
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

    try {
        const res = await fetch(`${SIM_BASE}/or-confirm`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                patient_id:   sug.patient_id,
                stay_id:      sug.stay_id,
                use_unurgent: true,
                doctor_id:    sug.doctor_id  || null,
                nurse1_id:    sug.nurse1_id  || null,
                nurse2_id:    sug.nurse2_id  || null,
            }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Confirm failed');

        const name = sug.name ? sug.name : `#${patientId}`;
        showMessage(`Patient ${name} routed to the unurgent treatment path.`, 'success');

        delete simCardOverrides[patientId];
        simEditPanelOpen.delete(patientId);
        simSuggestionsCache = simSuggestionsCache.filter(s => s.patient_id !== patientId);
        await refreshSimWaitingList();
        await simRunOR();

    } catch (err) {
        showMessage(`Simulation: ${err.message}`, 'error');
        if (btn) { btn.disabled = false; btn.textContent = '→ Send to Unurgent Path'; }
    }
}

function simClearRejections() {
    simRejectedCards.clear();
    if (simLastORData) _renderORSuggestions(simLastORData);
}

function simRejectSuggestion(patientId) {
    simRejectedCards.add(patientId);
    delete simCardOverrides[patientId];
    simEditPanelOpen.delete(patientId);
    simRunOR();
}

// ── Edit-panel: lazy data loader ──────────────────────────────────────────────

async function _simLoadEditData() {
    if (_simEditDataLoaded) return;
    _simEditDataLoaded = true;
    try {
        const [bRes, dRes, nRes] = await Promise.all([
            fetch('/api/beds/list'),
            fetch('/api/staff/doctors/list'),
            fetch('/api/staff/nurses/list'),
        ]);
        _simEditBeds    = ((await bRes.json()).beds    || []).filter(b => b.bed_status === 'Available');
        _simEditDoctors = (await dRes.json()).doctors  || [];
        _simEditNurses  = (await nRes.json()).nurses   || [];
    } catch (e) {
        console.warn('Failed to load edit data', e);
    }
}

// ── Edit-panel: toggle open / close ──────────────────────────────────────────

async function simToggleEditPanel(patientId) {
    const panelEl  = document.getElementById(`sim-ep-${patientId}`);
    const editBtn  = document.getElementById(`sim-edit-btn-${patientId}`);
    const confirmBtn = document.getElementById(`sim-confirm-btn-${patientId}`);
    if (!panelEl) return;

    if (simEditPanelOpen.has(patientId)) {
        // Close
        simEditPanelOpen.delete(patientId);
        panelEl.style.display = 'none';
        if (editBtn) { editBtn.textContent = '✏️ Edit'; editBtn.classList.remove('sim-edit-btn-open'); }
        if (confirmBtn) confirmBtn.textContent = '✓ Confirm';
    } else {
        // Open — load data first
        if (editBtn) { editBtn.textContent = '⏳'; editBtn.disabled = true; }
        await _simLoadEditData();
        if (editBtn) { editBtn.disabled = false; }

        simEditPanelOpen.add(patientId);
        _populateEditPanel(patientId);
        panelEl.style.display = '';
        if (editBtn) { editBtn.textContent = '✏️ Close'; editBtn.classList.add('sim-edit-btn-open'); }
        if (confirmBtn) confirmBtn.textContent = '✓ Update & Confirm';
    }
}

// ── Edit-panel: populate dropdowns ───────────────────────────────────────────

function _populateEditPanel(patientId) {
    const sug = simSuggestionsCache.find(s => s.patient_id === patientId);
    if (!sug) return;
    const ov = simCardOverrides[patientId] || {};

    // Bed select — available beds only
    const bedSel = document.getElementById(`sim-ep-bed-${patientId}`);
    if (bedSel) {
        const sugBedLabel = sug.bed_number ? `${sug.bed_number} (${sug.ward_name || ''})` : 'none';
        bedSel.innerHTML = `<option value="">— keep suggested: ${sugBedLabel} —</option>`;
        _simEditBeds.forEach(b => {
            const sel = ov.bed_id === b.bed_id ? 'selected' : '';
            const wardLabel = b.ward_name || (b.ward_id ? `Ward ${b.ward_id}` : 'No Ward');
            bedSel.innerHTML += `<option value="${b.bed_id}" ${sel}>${b.bed_number} · ${wardLabel} [${b.bed_type || 'normal'}]</option>`;
        });
        if (ov.bed_id !== undefined) bedSel.value = ov.bed_id;
    }

    // Doctor select
    const docSel = document.getElementById(`sim-ep-doc-${patientId}`);
    if (docSel) {
        const sugDocLabel = sug.doctor_name || (sug.doctor_id ? `Dr. #${sug.doctor_id}` : 'none');
        docSel.innerHTML = `<option value="">— keep suggested: ${sugDocLabel} —</option>`;
        docSel.innerHTML += `<option value="none" ${ov.skip_doctor ? 'selected' : ''}>⛔ No doctor — assign later</option>`;
        _simEditDoctors.filter(d => !d.absent).forEach(d => {
            const name   = d.name || `Dr. #${d.id}`;
            const type   = d.intern_or_not || '';
            const nb     = d.patientNb != null && String(d.patientNb).trim() !== '' ? parseInt(d.patientNb) : null;
            const load   = nb != null ? ` · ${nb} pt${nb !== 1 ? 's' : ''}` : '';
            const tag    = type ? ` (${type})` : '';
            const ctx    = [d.shift, d.work_days].filter(Boolean).join(' / ');
            const ctxTag = ctx ? ` — ${ctx}` : '';
            const label  = `${name}${tag}${load}${ctxTag}`;
            const sel    = !ov.skip_doctor && ov.doctor_id === d.id ? 'selected' : '';
            docSel.innerHTML += `<option value="${d.id}" ${sel}>${label}</option>`;
        });
    }

    // Nurse 1 select
    const n1Sel = document.getElementById(`sim-ep-n1-${patientId}`);
    if (n1Sel) {
        const sugN1Label = sug.nurse1_name || (sug.nurse1_id ? `#${sug.nurse1_id}` : 'none');
        n1Sel.innerHTML = `<option value="">— keep suggested: ${sugN1Label} —</option>`;
        n1Sel.innerHTML += `<option value="none" ${ov.skip_nurses ? 'selected' : ''}>⛔ No nurses — assign later</option>`;
        _simEditNurses.filter(n => !n.absent).forEach(n => {
            const name   = n.name || `Nurse #${n.id}`;
            const role   = n.role || '';
            const nb     = n.patientNB != null && String(n.patientNB).trim() !== '' ? parseInt(n.patientNB) : null;
            const load   = nb != null ? ` · ${nb} pt${nb !== 1 ? 's' : ''}` : '';
            const tag    = role ? ` (${role})` : '';
            const ctx    = [n.shift, n.group].filter(Boolean).join(' / ');
            const ctxTag = ctx ? ` — ${ctx}` : '';
            const label  = `${name}${tag}${load}${ctxTag}`;
            const sel    = !ov.skip_nurses && ov.nurse1_id === n.id ? 'selected' : '';
            n1Sel.innerHTML += `<option value="${n.id}" ${sel}>${label}</option>`;
        });
    }

    // Nurse 2 select (optional)
    const n2Sel = document.getElementById(`sim-ep-n2-${patientId}`);
    if (n2Sel) {
        const sugN2Label = sug.nurse2_name || (sug.nurse2_id ? `#${sug.nurse2_id}` : '—');
        n2Sel.innerHTML = `<option value="">— keep suggested: ${sugN2Label} —</option>`;
        n2Sel.innerHTML += `<option value="none">— no 2nd nurse —</option>`;
        _simEditNurses.filter(n => !n.absent).forEach(n => {
            const name   = n.name || `Nurse #${n.id}`;
            const role   = n.role || '';
            const nb     = n.patientNB != null && String(n.patientNB).trim() !== '' ? parseInt(n.patientNB) : null;
            const load   = nb != null ? ` · ${nb} pt${nb !== 1 ? 's' : ''}` : '';
            const tag    = role ? ` (${role})` : '';
            const ctx    = [n.shift, n.group].filter(Boolean).join(' / ');
            const ctxTag = ctx ? ` — ${ctx}` : '';
            const label  = `${name}${tag}${load}${ctxTag}`;
            const sel    = ov.nurse2_id === n.id ? 'selected' : '';
            n2Sel.innerHTML += `<option value="${n.id}" ${sel}>${label}</option>`;
        });
    }
}

// ── Edit-panel: apply a single override field ─────────────────────────────────

function simSetOverride(patientId, field, value) {
    if (!simCardOverrides[patientId]) simCardOverrides[patientId] = {};
    const ov = simCardOverrides[patientId];

    if (field === 'bed_id') {
        if (value === '') delete ov.bed_id;
        else ov.bed_id = parseInt(value);

    } else if (field === 'doc_select') {
        if (value === '') {
            delete ov.skip_doctor;
            delete ov.doctor_id;
        } else if (value === 'none') {
            ov.skip_doctor = true;
            delete ov.doctor_id;
        } else {
            ov.skip_doctor = false;
            ov.doctor_id   = parseInt(value);
        }

    } else if (field === 'n1_select') {
        if (value === '') {
            delete ov.skip_nurses;
            delete ov.nurse1_id;
            // sync nurse2 select back to default
            const n2Sel = document.getElementById(`sim-ep-n2-${patientId}`);
            if (n2Sel) n2Sel.disabled = false;
        } else if (value === 'none') {
            ov.skip_nurses = true;
            delete ov.nurse1_id;
            delete ov.nurse2_id;
            // disable nurse2 when skipping all nurses
            const n2Sel = document.getElementById(`sim-ep-n2-${patientId}`);
            if (n2Sel) { n2Sel.value = ''; n2Sel.disabled = true; }
        } else {
            ov.skip_nurses = false;
            ov.nurse1_id   = parseInt(value);
            const n2Sel = document.getElementById(`sim-ep-n2-${patientId}`);
            if (n2Sel) n2Sel.disabled = false;
        }

    } else if (field === 'n2_select') {
        if (value === '' ) delete ov.nurse2_id;
        else if (value === 'none') ov.nurse2_id = null;
        else ov.nurse2_id = parseInt(value);
    }
}

// ── Live shift/group clock ────────────────────────────────────────────────────

function _simShiftIcon(name) {
    const l = (name || '').toLowerCase();
    return l.includes('morning') ? '☀️' : l.includes('evening') ? '🌇' : l.includes('night') ? '🌙' : l.includes('day') ? '🌤️' : '🕐';
}

function _simStartClock() {
    // Clear any previous intervals to avoid duplicates on re-entry
    if (_simClockTickInterval)  clearInterval(_simClockTickInterval);
    if (_simClockFetchInterval) clearInterval(_simClockFetchInterval);

    _simTickClock();
    _simFetchClockContext();

    _simClockTickInterval  = setInterval(_simTickClock,        1000);
    _simClockFetchInterval = setInterval(_simFetchClockContext, 60000);
}

function _simTickClock() {
    const el = document.getElementById('sim-clock-time');
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function _simFetchClockContext() {
    try {
        const res  = await fetch(`${SIM_BASE}/current-context`);
        const data = await res.json();
        const shiftEl = document.getElementById('sim-clock-shift');
        const groupEl = document.getElementById('sim-clock-group');

        if (shiftEl) {
            if (data.no_shift_match || !data.shifts.length) {
                shiftEl.textContent = 'No shift match';
                shiftEl.classList.add('sim-clock-no-match');
            } else {
                shiftEl.textContent = data.shifts.join(' & ') + ' shift';
                shiftEl.classList.remove('sim-clock-no-match');
            }
        }
        if (groupEl) {
            if (data.no_group_match || !data.groups.length) {
                groupEl.textContent = 'No group match';
                groupEl.classList.add('sim-clock-no-match');
            } else {
                groupEl.textContent = data.group_names.join(' & ');
                groupEl.classList.remove('sim-clock-no-match');
            }
        }
    } catch (_) { /* non-fatal: clock still ticks */ }
}

// ── Staff audit ───────────────────────────────────────────────────────────────

async function simRunStaffAudit() {
    const panel = document.getElementById('sim-audit-panel');
    const body  = document.getElementById('sim-audit-body');
    if (!panel || !body) return;

    const btn = document.getElementById('sim-audit-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Scanning…'; }

    panel.style.display = '';
    body.innerHTML = '<div class="sim-loading"><div class="spinner"></div>Scanning staff assignments…</div>';

    // Respect the same shift/group override hierarchy as simRunOR
    const shiftVal = document.getElementById('sim-shift-select')?.value || '';
    const groupVal = document.getElementById('sim-group-select')?.value || '';
    const schedShiftVal = document.getElementById('sch-sf-shift')?.value || '';
    const schedGroupVal = document.getElementById('sch-sf-group')?.value || '';
    const shiftOverride = shiftVal || schedShiftVal || '';
    const groupOverride = groupVal || schedGroupVal || '';

    const strictNurses = document.getElementById('sim-audit-strict-nurses')?.checked || false;

    const params = new URLSearchParams();
    if (shiftOverride)  params.set('shift_override',  shiftOverride);
    if (groupOverride)  params.set('group_override',  groupOverride);
    if (strictNurses)   params.set('strict_nurses',   'true');

    try {
        const res  = await fetch(`${SIM_BASE}/staff-audit?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Audit failed');
        _renderStaffAudit(data);
    } catch (err) {
        body.innerHTML = `<div class="sim-empty-state" style="color:#dc2626">Error: ${err.message}</div>`;
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🔍 Audit Staff Assignments'; }
    }
}

function _renderStaffAudit(data) {
    const body  = document.getElementById('sim-audit-body');
    const title = document.getElementById('sim-audit-panel-title');

    // Build shift label from list
    let shiftLabel;
    if (data.no_shift_match || !data.current_shifts || !data.current_shifts.length) {
        shiftLabel = 'No shift match';
    } else {
        shiftLabel = data.current_shifts
            .map(s => `${_simShiftIcon(s)} ${s.charAt(0).toUpperCase() + s.slice(1)}`)
            .join(' & ') + ' shift';
    }

    // Build group label from list
    let groupLabel;
    if (data.no_group_match || !data.current_groups || !data.current_groups.length) {
        groupLabel = 'No group match';
    } else {
        groupLabel = data.current_groups.join(' & ');
    }

    if (!data.patients || data.patients.length === 0) {
        if (title) title.textContent = `Staff Audit — ${shiftLabel} · ${groupLabel}`;
        body.innerHTML = '<div class="sim-audit-all-ok">All staff are on duty — no reassignments needed.</div>';
        return;
    }

    const total = data.patients.length;
    if (title) {
        title.textContent = `Staff Audit — ${shiftLabel} · ${groupLabel} — ${total} patient(s) need attention`;
    }

    body.innerHTML = '';
    data.patients.forEach(p => body.appendChild(_buildAuditPatientCard(p)));
}

function _buildAuditPatientCard(p) {
    const card    = document.createElement('div');
    const laneCls = p.effective_acuity <= 2 ? 'lane-critical' : 'lane-normal';
    card.className = `sim-audit-card ${laneCls}`;
    card.id        = `sim-audit-${p.patient_id}`;

    const acuityLabel    = (p.acuity !== null && p.acuity !== undefined) ? `Acuity ${p.acuity}` : 'Acuity: null→1';
    const acuityBadgeCls = p.effective_acuity <= 2 ? 'badge-critical' : 'badge-normal';
    const nameStr        = p.name ? ` · ${p.name}` : '';
    const occStr         = p.occupation_time
        ? `<span class="sim-audit-occ">Admitted ${p.occupation_time}</span>` : '';

    const rowsHtml = (p.staff_assignments || [])
        .map(sa => _buildAuditStaffRow(sa, p.patient_id))
        .join('');

    card.innerHTML = `
        <div class="sim-audit-card-hdr">
            <span class="sim-acuity-badge ${acuityBadgeCls}">${acuityLabel}</span>
            <span class="sim-audit-patient-lbl">Patient #${p.patient_id}${nameStr}</span>
            <span class="sim-audit-bed">🛏 ${p.bed_number} · ${p.ward_name}</span>
            ${occStr}
        </div>
        <div class="sim-audit-issues">${rowsHtml}</div>`;

    return card;
}

function _buildAuditStaffRow(sa, patientId) {
    const icon   = sa.staff_type === 'doctor' ? '👨‍⚕️' : '👩‍⚕️';
    const safeId = `${patientId}-${sa.staff_id}-${sa.staff_type}`;

    // Status indicator + description
    let statusHtml;
    if (sa.is_mismatch) {
        const reasons = [];
        if (!sa.shift_ok) {
            if (sa.no_shift_match) {
                reasons.push(`shift: <em>${sa.current_staff_shift}</em> — no configured shift for this time`);
            } else {
                const expected = (sa.expected_shifts || []).join(' / ') || '—';
                reasons.push(`shift: <em>${sa.current_staff_shift}</em> ≠ <em>${expected}</em>`);
            }
        }
        if (!sa.group_ok) {
            if (sa.no_group_match) {
                reasons.push(`group: <em>${sa.current_staff_group}</em> — no configured group for today`);
            } else {
                const expected = (sa.expected_groups || []).join(' / ') || '—';
                reasons.push(`group: <em>${sa.current_staff_group}</em> ≠ <em>${expected}</em>`);
            }
        }
        statusHtml = `<span class="sim-audit-warn-icon">⚠</span>
            <div class="sim-audit-issue-body">
                <div class="sim-audit-issue-who">${icon} <strong>${sa.staff_name}</strong> — ${reasons.join(', ')}</div>`;
    } else {
        statusHtml = `<span class="sim-audit-ok-icon">✓</span>
            <div class="sim-audit-issue-body">
                <div class="sim-audit-issue-who sim-audit-ok-who">${icon} <strong>${sa.staff_name}</strong> — on duty</div>`;
    }

    // Replacement dropdown — always shown; on-duty staff first, off-duty in a separate group
    let suggHtml;
    if (sa.candidates && sa.candidates.length > 0) {
        const onDuty  = sa.candidates.filter(c => c.on_duty);
        const offDuty = sa.candidates.filter(c => !c.on_duty);

        const _buildOpt = (c, selected) => {
            const roleOrType = c.type || c.role || '';
            const load       = c.patientNb != null ? ` · ${c.patientNb} pt${c.patientNb !== 1 ? 's' : ''}` : '';
            const tag        = roleOrType ? ` (${roleOrType})` : '';
            const ctx        = [c.shift, c.group].filter(Boolean).join(' / ');
            const ctxTag     = ctx ? ` — ${ctx}` : '';
            return `<option value="${c.id}"${selected ? ' selected' : ''}>${c.name}${tag}${load}${ctxTag}</option>`;
        };

        let optHtml = '';
        if (onDuty.length) {
            optHtml += `<optgroup label="✓ On duty">`;
            optHtml += onDuty.map((c, i) => _buildOpt(c, i === 0)).join('');
            optHtml += `</optgroup>`;
        }
        if (offDuty.length) {
            optHtml += `<optgroup label="○ Off duty">`;
            // Pre-select first off-duty candidate only when there are no on-duty ones
            optHtml += offDuty.map((c, i) => _buildOpt(c, !onDuty.length && i === 0)).join('');
            optHtml += `</optgroup>`;
        }

        suggHtml = `
            <div class="sim-audit-suggestion">
                <span class="sim-audit-arrow">→</span>
                <select class="sim-audit-select" id="sim-asel-${safeId}">${optHtml}</select>
                <button class="sim-audit-confirm-btn${sa.is_mismatch ? '' : ' sim-audit-confirm-ok'}"
                        id="sim-acb-${safeId}"
                        onclick="simConfirmStaffSwapFromSelect('${safeId}', ${patientId}, ${sa.staff_id}, '${sa.staff_type}')">
                    Update &amp; Confirm
                </button>
            </div>`;
    } else {
        suggHtml = '<div class="sim-audit-no-sugg">No replacement available (all staff are absent)</div>';
    }

    const rowCls = sa.is_mismatch ? 'sim-audit-issue-row' : 'sim-audit-issue-row sim-audit-ok-row';
    return `
        <div class="${rowCls}" id="sim-air-${safeId}">
            ${statusHtml}
                ${suggHtml}
            </div>
        </div>`;
}

async function simConfirmStaffSwapFromSelect(safeId, patientId, oldId, staffType) {
    const sel = document.getElementById(`sim-asel-${safeId}`);
    if (!sel) return;
    const newId = parseInt(sel.value, 10);
    if (!newId) return;
    await simConfirmStaffSwap(patientId, oldId, newId, staffType);
}

async function simConfirmStaffSwap(patientId, oldId, newId, staffType) {
    const safeId = `${patientId}-${oldId}-${staffType}`;
    const btn    = document.getElementById(`sim-acb-${safeId}`);
    if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

    try {
        const res  = await fetch(`${SIM_BASE}/staff-swap`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                patient_id:   patientId,
                old_staff_id: oldId,
                new_staff_id: newId,
                staff_type:   staffType,
            }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Swap failed');

        showMessage(data.message || `Staff updated for patient #${patientId}.`, 'success');
        // Re-run the full audit to reflect the updated assignments
        await simRunStaffAudit();

    } catch (err) {
        showMessage(`Swap failed: ${err.message}`, 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Update & Confirm'; }
    }
}
