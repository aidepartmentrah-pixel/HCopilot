// patient-details-view.js — read-only Patient Details modal.
//
// Fetches the full stay record (core fields + ISBAR) from
// GET /api/patients/{stay_id}/details (falls back to LogPatients server-side,
// so this works for both active and discharged stays) and renders it as a
// sticky summary header + the same 6 sections as the entry form, reusing
// ISBAR_METADATA_SECTIONS (patient-isbar-fields.js) so the two views never
// drift out of sync. Missing values always render as "Not recorded" — never
// fabricated — per the task's explicit requirement.
//
// Three surfaces share one field-building pass (_pdBuildSectionsData below)
// but present it differently:
//   'modal'   — the original read-only Patient Details modal (Page A "View"),
//               unchanged: an accordion, Patient & Arrival/Vitals open by
//               default, footer is Close + Edit Patient Data.
//   'preview' — Page C's persistent preview pane: a horizontal TAB strip,
//               not an accordion (2026-09-22 feedback — stacking all 6
//               sections vertically in a narrow pane meant expanding even
//               two of them made it very tall with an awkward internal
//               scrollbar; tabs show exactly one section's fields at a
//               time, so the pane's height stays short and predictable
//               regardless of which tab is open). "Open Full Record" sits
//               right under the summary header, always visible — not
//               buried at the bottom of accumulated content.
//   'full'    — Page C's dedicated full-width page (UI-C4): an accordion
//               with every section open (the "long text, deep review"
//               surface), footer is Print / Export PDF / Edit Record.

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

function _pdCsvLabels(section, fieldId, csv) {
    if (!csv) return null;
    const field = section.fields.find(f => f.id === fieldId);
    if (!field) return csv;
    return csv.split(',').map(t => t.trim()).filter(Boolean).map(t => isbarOptionLabel(field, t)).join(', ');
}

// ── Section data builders ────────────────────────────────────────────────
// Each returns { number, icon, title, summary, hasData, bodyHtml, gridClass }
// — pure field-formatting, no accordion/tab markup. Both renderers below
// (accordion for modal/full, tabs for preview) consume the same array, so
// the two presentations can never drift apart on what data they show.

function _pdPatientArrivalData(d) {
    const bed = patientBedMap && d.patient_id != null ? patientBedMap[d.patient_id] : null;
    const bedStr = bed ? (bed.bed_number + (bed.bed_type ? ' (' + bed.bed_type + ')' : '')) : null;
    const bodyHtml =
        _pdField('Patient ID', _pdVal(d.patient_id)) +
        _pdField('Stay ID', _pdVal(d.stay_id)) +
        _pdField('Name', _pdVal(d.name)) +
        _pdField('Age', _pdVal(d.age != null ? _formatAgeDisplay(d.age) : null)) +
        _pdField('Gender', _pdVal(d.gender)) +
        _pdField('Arrival Time', d.arrival_time ? '<span class="value">' + _formatDatetime(d.arrival_time) + '</span>' : '<span class="value not-recorded">Not recorded</span>') +
        _pdField('Departure Time', _pdVal(d.departure_time)) +
        _pdField('Bed Occupation Time', _pdVal(d.bed_occupation_time)) +
        _pdField('Bed', _pdVal(bedStr)) +
        _pdField('Chief Complaint', _pdVal(d.chiefcomplaint));
    return {
        number: 1, icon: ISBAR_SECTION_ICONS['patient-arrival'], title: 'Patient & Arrival',
        summary: d.chiefcomplaint ? d.chiefcomplaint : 'Not recorded',
        hasData: !!d.chiefcomplaint, bodyHtml, gridClass: 'isbar-grid-patient-arrival',
    };
}

function _pdVitalsData(d) {
    const isbar = d.isbar || {};
    const bodyHtml =
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
    return {
        number: 2, icon: ISBAR_SECTION_ICONS.vitals, title: 'Initial Vital Signs',
        summary: 'BP ' + (d.sbp ?? '–') + '/' + (d.dbp ?? '–') + ' · HR ' + (d.heartrate ?? '–') + ' · SpO₂ ' + (d.o2sat ?? '–') + '%',
        hasData: d.sbp != null || d.heartrate != null, bodyHtml, gridClass: 'isbar-grid-vitals',
    };
}

// One metadata-driven section (Situation/Background/Focused/Recommendation) —
// reuses the same field list as the entry form.
function _pdMetaSectionData(section, isbar) {
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

    return {
        number: section.number, icon: section.icon, title: section.title,
        summary: filledLabels.length ? filledLabels.slice(0, 3).join(' · ') : 'Not recorded',
        hasData: filledLabels.length > 0, bodyHtml, gridClass: 'isbar-grid-' + section.id,
    };
}

function _pdBuildSectionsData(d) {
    const isbar = d.isbar || {};
    return [
        _pdPatientArrivalData(d),
        _pdVitalsData(d),
        ...ISBAR_METADATA_SECTIONS.map(s => _pdMetaSectionData(s, isbar)),
    ];
}

// ── Accordion presentation (modal / full) ───────────────────────────────────

// Read-only sections have no in-progress/error state (they only ever show
// what was saved), so status here is purely informational: "complete" (green)
// when the section has any recorded data, "none" (gray) when it's entirely
// unrecorded — never blue/red, those describe active data entry only.
function _pdAccordionSection(s, defaultOpen) {
    const status = s.hasData ? 'complete' : 'none';
    const badge = '<span class="isbar-status-badge isbar-status-' + status + '">' + (s.hasData ? 'Recorded' : 'Not recorded') + '</span>';
    const detail = s.summary ? ' <span class="isbar-status-detail">' + _isbarEsc(s.summary) + '</span>' : '';
    return '<details class="isbar-section" data-status="' + status + '"' + (defaultOpen ? ' open' : '') + '>' +
        '<summary class="isbar-section-summary">' +
            '<span class="isbar-section-number">' + s.number + '</span>' +
            '<span class="isbar-section-icon" aria-hidden="true">' + s.icon + '</span>' +
            '<span class="isbar-section-title">' + s.title + '</span>' +
            '<span class="isbar-section-status">' + badge + detail + '</span>' +
            '<span class="isbar-chevron" aria-hidden="true"></span>' +
        '</summary>' +
        '<div class="pdetails-section-body ' + s.gridClass + '">' + (s.bodyHtml || '<p class="isbar-empty-hint">No applicable fields.</p>') + '</div>' +
    '</details>';
}

function _pdAccordionHtml(sectionsData, mode) {
    const bodyParts = sectionsData.map((s, i) => _pdAccordionSection(s, mode === 'full' ? true : i < 2));
    return '<div class="isbar-accordion">' + bodyParts.join('') + '</div>';
}

// ── Tab presentation (preview pane) ──────────────────────────────────────────
// 2026-09-22 feedback: a narrow pane doesn't suit a vertically-stacking
// accordion — expanding even two sections made it very tall with an
// internal scrollbar cropping the rest. Tabs show exactly one section's
// fields at a time instead, so the pane's height stays short and
// consistent no matter which one is open.
//
// First cut used full-width tabs (icon + title + status badge each), which
// looked "nicer" in isolation but meant each one filled the pane's whole
// width and wrapped onto its own row — six of them stacked vertically,
// which is visually just the accordion's summary list again, defeating the
// point. Fixed (Option 1 of 3 proposed) by shrinking tabs to small circular
// icon buttons with a colored status ring — compact enough that all 6
// always fit on one row, in any pane width, no wrapping. The title/icon/
// summary/Recorded-badge richness this cost on the tab itself already
// lives one place down, in the tabpanel heading below, so no information
// is actually lost — it just isn't duplicated on the selector too.

function _pdTabsHtml(sectionsData) {
    const tabs = sectionsData.map((s, i) =>
        '<button type="button" class="pdetails-tab pdetails-tab-' + (s.hasData ? 'complete' : 'none') + (i === 0 ? ' active' : '') + '" data-tab-idx="' + i + '" ' +
            'title="' + _isbarEsc(s.title) + ' — ' + (s.hasData ? 'Recorded' : 'Not recorded') + '" onclick="_pdSwitchTab(this)">' +
            '<span class="pdetails-tab-num">' + s.number + '</span>' +
        '</button>'
    ).join('');

    const heading = (s) =>
        '<span class="isbar-section-icon" aria-hidden="true">' + s.icon + '</span>' +
        '<strong>' + s.title + '</strong>' +
        '<span class="pdetails-tab-heading-summary">' + _isbarEsc(s.summary) + '</span>';

    const panels = sectionsData.map((s, i) =>
        '<div class="pdetails-tabpanel" data-tabpanel-idx="' + i + '"' + (i === 0 ? '' : ' hidden') + '>' +
            '<div class="pdetails-tabpanel-heading" data-tabheading-idx="' + i + '">' + heading(s) + '</div>' +
            '<div class="pdetails-section-body ' + s.gridClass + '">' + (s.bodyHtml || '<p class="isbar-empty-hint">No applicable fields.</p>') + '</div>' +
        '</div>'
    ).join('');

    return '<div class="pdetails-tabs" role="tablist">' + tabs + '</div>' +
        '<div class="pdetails-tabpanels">' + panels + '</div>';
}

function _pdSwitchTab(btn) {
    const container = btn.closest('.pdetails-body');
    if (!container) return;
    const idx = btn.dataset.tabIdx;
    container.querySelectorAll('.pdetails-tab').forEach(t => t.classList.toggle('active', t === btn));
    container.querySelectorAll('[data-tabpanel-idx]').forEach(p => { p.hidden = p.dataset.tabpanelIdx !== idx; });
}

// ER UI Architecture Redesign, Page C (UI-C2) — the shared render function
// the doc asked to extract: one field-building pass (_pdBuildSectionsData)
// now backs three presentations instead of duplicating field markup per
// surface. See the file header for what 'modal'/'preview'/'full' each mean.
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
                '<div class="pdetails-summary-item"><div class="label">Age / Gender</div><div class="value">' + (d.age != null ? _formatAgeDisplay(d.age) : '–') + (d.gender ? ' / ' + d.gender : '') + '</div></div>' +
                '<div class="pdetails-summary-item"><div class="label">Arrival</div><div class="value">' + _formatDatetime(d.arrival_time) + '</div></div>' +
                '<div class="pdetails-summary-item"><div class="label">Acuity</div><div class="value">' + (acuityLvl ? acuityLvl + ' — ' + acuityLabels[acuityLvl] : '–') + '</div></div>' +
                '<div class="pdetails-summary-item"><div class="label">Clinical Status</div><div class="value">' + (isbar.clinical_status || '–') + '</div></div>' +
            '</div>' +
        '</div>';

    const sectionsData = _pdBuildSectionsData(d);

    if (mode === 'preview') {
        // "Open Full Record" sits right under the header — always visible,
        // never buried at the bottom of content (2026-09-22 feedback).
        const actions = '<div class="pdetails-preview-actions">' +
            '<button class="s-btn s-btn-primary" onclick="openFullRecordPage(' + d.stay_id + ')">📄 Open Full Record</button>' +
        '</div>';
        const body = '<div class="pdetails-body">' + _pdTabsHtml(sectionsData) + '</div>';
        return header + actions + body;
    }

    const body = '<div class="pdetails-body">' + _pdAccordionHtml(sectionsData, mode) + '</div>';

    let footer;
    if (mode === 'full') {
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
