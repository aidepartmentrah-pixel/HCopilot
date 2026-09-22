// patient-details-view.js — read-only Patient Details modal.
//
// Fetches the full stay record (core fields + ISBAR) from
// GET /api/patients/{stay_id}/details (falls back to LogPatients server-side,
// so this works for both active and discharged stays) and renders it as a
// sticky summary header + the same 6 accordion sections as the entry form,
// reusing ISBAR_METADATA_SECTIONS (patient-isbar-fields.js) so the two views
// never drift out of sync. Missing values always render as "Not recorded" —
// never fabricated — per the task's explicit requirement.

let pdetailsCurrentRow = null; // last-fetched full record, kept for the "Edit Patient Data" handoff

function closePatientDetailsModal() {
    document.getElementById('patient-details-modal').style.display = 'none';
    pdetailsCurrentRow = null;
}

window.addEventListener('click', function(e) {
    if (e.target === document.getElementById('patient-details-modal')) closePatientDetailsModal();
});

async function openPatientDetailsModal(stayId) {
    const modal = document.getElementById('patient-details-modal');
    const content = document.getElementById('pdetails-content');
    content.innerHTML = '<div class="loading"><div class="spinner"></div>Loading patient details...</div>';
    modal.style.display = 'block';

    try {
        const res = await fetch('/api/patients/' + stayId + '/details');
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'HTTP ' + res.status);
        }
        const data = await res.json();
        pdetailsCurrentRow = data;
        content.innerHTML = renderPatientDetailsHtml(data);
    } catch (error) {
        content.innerHTML = '<div class="error-state"><div class="error-icon">❌</div><h3>Error Loading Patient</h3><p>' + error.message + '</p></div>';
    }
}

function pdetailsEditFromHere() {
    if (!pdetailsCurrentRow) return;
    const d = pdetailsCurrentRow;
    const row = {
        patient_id: d.patient_id, subject_id: d.patient_id, stay_id: d.stay_id,
        name: d.name, gender: d.gender, age: d.age,
        arrival_time: d.arrival_time, departure_time: d.departure_time,
        bed_occupation_time: d.bed_occupation_time,
        temperature: d.temperature, heartrate: d.heartrate, resprate: d.resprate,
        o2sat: d.o2sat, sbp: d.sbp, dbp: d.dbp, pain: d.pain, acuity: d.acuity,
        chiefcomplaint: d.chiefcomplaint, destination: d.destination,
    };
    closePatientDetailsModal();
    openEditPatientModal(row, d.source === 'log' ? 'log' : 'daily');
}

function _pdVal(v, unit) {
    if (v === null || v === undefined || v === '') return '<span class="value not-recorded">Not recorded</span>';
    return '<span class="value">' + _isbarEsc(String(v)) + (unit ? ' ' + unit : '') + '</span>';
}

function _pdField(label, valueHtml) {
    return '<div class="pdetails-field"><div class="label">' + label + '</div>' + valueHtml + '</div>';
}

// Read-only sections have no in-progress/error state (they only ever show
// what was saved), so status here is purely informational: "complete" (green)
// when the section has any recorded data, "none" (gray) when it's entirely
// unrecorded — never blue/red, those describe active data entry only.
function _pdSectionHeader(number, iconSvg, title, summaryText, hasData, open) {
    const status = hasData ? 'complete' : 'none';
    const badge = '<span class="isbar-status-badge isbar-status-' + status + '">' + (hasData ? 'Recorded' : 'Not recorded') + '</span>';
    const detail = summaryText ? ' <span class="isbar-status-detail">' + _isbarEsc(summaryText) + '</span>' : '';
    return '<details class="isbar-section" data-status="' + status + '"' + (open ? ' open' : '') + '>' +
        '<summary class="isbar-section-summary">' +
            '<span class="isbar-section-number">' + number + '</span>' +
            '<span class="isbar-section-icon" aria-hidden="true">' + iconSvg + '</span>' +
            '<span class="isbar-section-title">' + title + '</span>' +
            '<span class="isbar-section-status">' + badge + detail + '</span>' +
            '<span class="isbar-chevron" aria-hidden="true"></span>' +
        '</summary>';
}

function _pdCsvLabels(section, fieldId, csv) {
    if (!csv) return null;
    const field = section.fields.find(f => f.id === fieldId);
    if (!field) return csv;
    return csv.split(',').map(t => t.trim()).filter(Boolean).map(t => isbarOptionLabel(field, t)).join(', ');
}

// Renders one metadata-driven section (Situation/Background/Focused/Recommendation)
// as a read-only accordion section, reusing the same field list as the entry form.
function renderReadOnlyMetaSection(section, isbar, defaultOpen) {
    isbar = isbar || {};
    let lastSubheading = null;
    let bodyHtml = '';
    const filledLabels = [];

    section.fields.forEach(field => {
        if (field.conditionalOn && !isbarFieldVisible(field, isbar)) return;
        if (section.subheadings && section.subheadings[field.id] && section.subheadings[field.id] !== lastSubheading) {
            lastSubheading = section.subheadings[field.id];
            bodyHtml += '<div class="pdetails-subheading">' + lastSubheading + '</div>';
        }
        const raw = isbar[field.id];
        let displayHtml;
        if (raw === null || raw === undefined || raw === '') {
            displayHtml = '<span class="value not-recorded">Not recorded</span>';
        } else if (field.type === 'checkbox-group') {
            displayHtml = _pdVal(_pdCsvLabels(section, field.id, raw));
            filledLabels.push(_pdCsvLabels(section, field.id, raw));
        } else if (field.type === 'radio-group') {
            const label = isbarOptionLabel(field, raw);
            displayHtml = _pdVal(label);
            filledLabels.push(label);
        } else if (field.type === 'boolean') {
            displayHtml = _pdVal(raw ? 'Yes' : 'No');
            if (raw) filledLabels.push(field.label);
        } else if (field.type === 'number') {
            displayHtml = _pdVal(raw, field.unit);
            filledLabels.push(String(raw));
        } else {
            displayHtml = _pdVal(raw);
            filledLabels.push(String(raw).slice(0, 30));
        }
        bodyHtml += _pdField(field.label, displayHtml);
    });

    const summary = filledLabels.length
        ? filledLabels.slice(0, 3).join(' · ')
        : 'Not recorded';

    return _pdSectionHeader(section.number, section.icon, section.title, summary, filledLabels.length > 0, !!defaultOpen) +
        '<div class="pdetails-section-body isbar-grid-' + section.id + '">' + (bodyHtml || '<p class="isbar-empty-hint">No applicable fields.</p>') + '</div>' +
    '</details>';
}

function renderPatientArrivalReadOnly(d, defaultOpen) {
    const bed = patientBedMap && d.patient_id != null ? patientBedMap[d.patient_id] : null;
    const bedStr = bed ? (bed.bed_number + (bed.bed_type ? ' (' + bed.bed_type + ')' : '')) : null;
    const body =
        _pdField('Patient ID', _pdVal(d.patient_id)) +
        _pdField('Stay ID', _pdVal(d.stay_id)) +
        _pdField('Name', _pdVal(d.name)) +
        _pdField('Age', _pdVal(d.age)) +
        _pdField('Gender', _pdVal(d.gender)) +
        _pdField('Arrival Time', d.arrival_time ? '<span class="value">' + _formatDatetime(d.arrival_time) + '</span>' : '<span class="value not-recorded">Not recorded</span>') +
        _pdField('Departure Time', _pdVal(d.departure_time)) +
        _pdField('Bed Occupation Time', _pdVal(d.bed_occupation_time)) +
        _pdField('Bed', _pdVal(bedStr)) +
        _pdField('Chief Complaint', _pdVal(d.chiefcomplaint));
    const summary = d.chiefcomplaint ? d.chiefcomplaint : 'Not recorded';
    return _pdSectionHeader(1, ISBAR_SECTION_ICONS['patient-arrival'], 'Patient & Arrival', summary, !!d.chiefcomplaint, defaultOpen) +
        '<div class="pdetails-section-body isbar-grid-patient-arrival">' + body + '</div>' +
    '</details>';
}

function renderVitalsReadOnly(d, defaultOpen) {
    const isbar = d.isbar || {};
    const body =
        _pdField('Temperature', _pdVal(d.temperature, '°C')) +
        _pdField('Heart Rate', _pdVal(d.heartrate, 'bpm')) +
        _pdField('Respiratory Rate', _pdVal(d.resprate, '/min')) +
        _pdField('O₂ Saturation', _pdVal(d.o2sat, '%')) +
        _pdField('Blood Pressure', (d.sbp != null || d.dbp != null) ? _pdVal((d.sbp ?? '–') + ' / ' + (d.dbp ?? '–'), 'mmHg') : _pdVal(null)) +
        _pdField('Pain Score', _pdVal(d.pain)) +
        _pdField('Blood Glucose', _pdVal(isbar.blood_glucose, 'mg/dL')) +
        _pdField('Oxygen / Airway Support', _pdVal(isbar.o2_support ? isbarOptionLabel({options:[
            {value:'room_air',label:'Room air'},{value:'nasal_cannula',label:'Nasal cannula'},
            {value:'simple_mask',label:'Simple mask'},{value:'non_rebreather',label:'Non-rebreather'},
            {value:'high_flow_nc',label:'High-flow nasal cannula'},{value:'cpap_bipap',label:'CPAP / BiPAP'},
            {value:'mechanical_vent',label:'Mechanical ventilation'}]}, isbar.o2_support) : null)) +
        _pdField('O₂ Flow Rate', _pdVal(isbar.o2_flow_rate, 'L/min')) +
        _pdField('Measured At', _pdVal(isbar.vitals_measured_at)) +
        _pdField('Recorded By', _pdVal(isbar.vitals_recorded_by));
    const summary = 'BP ' + (d.sbp ?? '–') + '/' + (d.dbp ?? '–') + ' · HR ' + (d.heartrate ?? '–') + ' · SpO₂ ' + (d.o2sat ?? '–') + '%';
    return _pdSectionHeader(2, ISBAR_SECTION_ICONS.vitals, 'Initial Vital Signs', summary, d.sbp != null || d.heartrate != null, defaultOpen) +
        '<div class="pdetails-section-body isbar-grid-vitals">' + body + '</div>' +
    '</details>';
}

// ER UI Architecture Redesign, Page C (UI-C2) — this is the shared render
// function the doc asked to extract: the same markup now backs three
// surfaces instead of duplicating it per-surface.
//   'modal'   — the original read-only Patient Details modal (Page A "View"),
//               unchanged: Patient & Arrival/Vitals open by default, footer
//               is Close + Edit Patient Data.
//   'preview' — Page C's persistent preview pane: every section starts
//               collapsed (confirmed decision #10: "compact/collapsed
//               form"), footer is just "Open Full Record" — no direct edit
//               here, the pane stays inspection-focused.
//   'full'    — Page C's dedicated full-width page (UI-C4): every section
//               starts open (this is the "long text, deep review" surface),
//               footer is Print / Export PDF / Edit Record. The Option 4
//               mockup shows these three buttons on the preview pane itself,
//               but the tracking doc's own confirmed decision #10 is explicit
//               that the preview stays inspection-only — see the doc's log
//               for that call.
function renderPatientDetailsHtml(d, opts) {
    const mode = (opts && opts.mode) || 'modal';
    const isbar = d.isbar || {};
    const acuityLabels = { 1:'Immediate', 2:'Emergent', 3:'Urgent', 4:'Less Urgent', 5:'Non-Urgent' };
    const acuityLvl = d.acuity != null ? Math.round(d.acuity) : null;

    const badges = [];
    if (isbar.allergies_status === 'Yes') badges.push('<span class="pdetails-badge pdetails-badge-allergy">⚠️ Allergy</span>');
    if (isbar.isolation_precautions && isbar.isolation_precautions !== 'None') badges.push('<span class="pdetails-badge pdetails-badge-isolation">🦠 Isolation: ' + _isbarEsc(isbar.isolation_precautions) + '</span>');
    if (isbar.fall_risk === 'Yes') badges.push('<span class="pdetails-badge pdetails-badge-fall">🚶 Fall Risk</span>');

    const header =
        '<div class="pdetails-header">' +
            '<div class="pdetails-header-top">' +
                '<div>' +
                    '<h3 class="pdetails-title">' + (d.name ? _isbarEsc(d.name) : 'Unnamed Patient') + '</h3>' +
                    '<div class="pdetails-subtitle">Patient #' + d.patient_id + ' · Stay #' + d.stay_id + (d.source === 'log' ? ' · Discharged' : '') + '</div>' +
                '</div>' +
                (badges.length ? '<div class="pdetails-badges">' + badges.join('') + '</div>' : '') +
            '</div>' +
            '<div class="pdetails-summary-grid">' +
                '<div class="pdetails-summary-item"><div class="label">Age / Gender</div><div class="value">' + (d.age ?? '–') + (d.gender ? ' / ' + d.gender : '') + '</div></div>' +
                '<div class="pdetails-summary-item"><div class="label">Arrival</div><div class="value">' + _formatDatetime(d.arrival_time) + '</div></div>' +
                '<div class="pdetails-summary-item"><div class="label">Acuity</div><div class="value">' + (acuityLvl ? acuityLvl + ' — ' + acuityLabels[acuityLvl] : '–') + '</div></div>' +
                '<div class="pdetails-summary-item"><div class="label">Clinical Status</div><div class="value">' + (isbar.clinical_status || '–') + '</div></div>' +
            '</div>' +
        '</div>';

    // 'preview' starts every section collapsed; 'modal' keeps its original
    // behavior (arrival/vitals open); 'full' opens everything for reading.
    const coreOpen = mode !== 'preview';
    const body =
        '<div class="pdetails-body">' +
        '<div class="isbar-accordion">' +
            renderPatientArrivalReadOnly(d, coreOpen) +
            renderVitalsReadOnly(d, coreOpen) +
            ISBAR_METADATA_SECTIONS.map(s => renderReadOnlyMetaSection(s, isbar, mode === 'full')).join('') +
        '</div>' +
        '</div>';

    let footer;
    if (mode === 'preview') {
        footer =
            '<div class="pdetails-footer">' +
                '<button class="s-btn s-btn-primary" onclick="openFullRecordPage(' + d.stay_id + ')">📄 Open Full Record</button>' +
            '</div>';
    } else if (mode === 'full') {
        footer =
            '<div class="pdetails-footer">' +
                '<button class="s-btn s-btn-outline" onclick="window.print()">🖨️ Print</button>' +
                '<button class="s-btn s-btn-outline" onclick="window.print()" title="Use your browser\'s print dialog and choose \'Save as PDF\' as the destination">📄 Export PDF</button>' +
                '<button class="s-btn s-btn-primary" onclick="editFullRecord()">✏️ Edit Record</button>' +
            '</div>';
    } else {
        footer =
            '<div class="pdetails-footer">' +
                '<button class="s-btn s-btn-outline" onclick="closePatientDetailsModal()">Close</button>' +
                '<button class="s-btn s-btn-primary" onclick="pdetailsEditFromHere()">✏️ Edit Patient Data</button>' +
            '</div>';
    }

    return header + body + footer;
}
