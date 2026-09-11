// patient-isbar-form.js — accordion rendering + state + validation engine for
// the ISBAR Situation/Background/Focused-Assessment/Recommendation sections.
//
// Patient & Arrival and Initial Vital Signs stay hand-written in index.html
// (see patients.js submitPatientForm/saveEditPatient for those) — this file
// only owns the four metadata-driven sections from patient-isbar-fields.js.
//
// State lives in `isbarState.add` / `isbarState.edit` (plain objects, one
// per form instance), never in the DOM. Collapsing a <details> section only
// hides/shows markup — it never touches this state — so re-expanding a
// section always shows exactly what was entered, per the "never lose data
// on collapse" requirement.

const isbarState = { add: {}, edit: {} };
let isbarAddDirty = false; // tracks whether the add-page form has any entered data, for the unsaved-changes guard

function isbarSectionContainerId(mode, sectionId) {
    return `isbar-fields-${sectionId}-${mode}`;
}

function isbarSummaryId(mode, sectionId) {
    return `isbar-summary-${sectionId}-${mode}`;
}

// ── Rendering ─────────────────────────────────────────────────────────────

function renderIsbarAccordionSections(mode) {
    const state = isbarState[mode];
    return ISBAR_METADATA_SECTIONS.map(section => {
        const containerId = isbarSectionContainerId(mode, section.id);
        const summaryId    = isbarSummaryId(mode, section.id);
        return `
        <details class="isbar-section" id="isbar-details-${section.id}-${mode}">
            <summary class="isbar-section-summary">
                <span class="isbar-section-title">${section.icon} ${section.title}</span>
                <span class="isbar-section-status" id="${summaryId}">Not started</span>
                <span class="isbar-chevron" aria-hidden="true"></span>
            </summary>
            <div class="isbar-section-body" id="${containerId}"></div>
        </details>`;
    }).join('');
}

function isbarFieldInputHtml(field, mode, value) {
    const name = `isbar-${mode}-${field.id}`;
    switch (field.type) {
        case 'textarea':
            return `<textarea id="${name}" class="isbar-input" data-field-id="${field.id}" data-mode="${mode}" rows="2">${value ? _isbarEsc(value) : ''}</textarea>`;
        case 'number':
            return `<div class="isbar-number-wrap"><input type="number" id="${name}" class="isbar-input" data-field-id="${field.id}" data-mode="${mode}" value="${value != null ? value : ''}">${field.unit ? `<span class="isbar-unit">${field.unit}</span>` : ''}</div>`;
        case 'datetime':
            return `<input type="datetime-local" id="${name}" class="isbar-input" data-field-id="${field.id}" data-mode="${mode}" value="${value ? String(value).slice(0, 16) : ''}">`;
        case 'boolean':
            return `<label class="isbar-boolean-check"><input type="checkbox" id="${name}" data-field-id="${field.id}" data-mode="${mode}" ${value ? 'checked' : ''}> ${field.label}</label>`;
        case 'radio-group':
            return `<div class="isbar-chip-group" role="radiogroup" aria-label="${field.label}">` +
                isbarOptionValues(field).map(v => {
                    const label = isbarOptionLabel(field, v);
                    const selected = value === v;
                    return `<button type="button" class="isbar-chip ${selected ? 'selected' : ''}" data-field-id="${field.id}" data-mode="${mode}" data-radio-value="${_isbarEsc(v)}">${_isbarEsc(label)}</button>`;
                }).join('') + `</div>`;
        case 'checkbox-group': {
            const selectedTokens = value ? String(value).split(',').map(t => t.trim()) : [];
            return `<div class="isbar-chip-group">` +
                (field.options || []).map(o => {
                    const v = typeof o === 'string' ? o : o.value;
                    const label = typeof o === 'string' ? o : o.label;
                    const selected = selectedTokens.includes(v);
                    return `<button type="button" class="isbar-chip ${selected ? 'selected' : ''}" data-field-id="${field.id}" data-mode="${mode}" data-checkbox-value="${_isbarEsc(v)}">${_isbarEsc(label)}</button>`;
                }).join('') + `</div>`;
        }
        case 'text':
        default:
            return `<input type="text" id="${name}" class="isbar-input" data-field-id="${field.id}" data-mode="${mode}" value="${value ? _isbarEsc(value) : ''}">`;
    }
}

function _isbarEsc(v) {
    return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderIsbarSectionBody(mode, sectionId) {
    const section = ISBAR_METADATA_SECTIONS.find(s => s.id === sectionId);
    const container = document.getElementById(isbarSectionContainerId(mode, sectionId));
    if (!section || !container) return;
    const state = isbarState[mode];

    let html = '';
    let lastSubheading = null;
    section.fields.forEach(field => {
        if (!isbarFieldVisible(field, state)) return;
        if (section.subheadings && section.subheadings[field.id] && section.subheadings[field.id] !== lastSubheading) {
            lastSubheading = section.subheadings[field.id];
            html += `<h4 class="isbar-subheading">${lastSubheading}</h4>`;
        }
        const value = state[field.id];
        const requiredMark = field.requiredTier === 'conditional' ? '<span class="isbar-required-mark">*</span>' : '';
        if (field.type === 'boolean') {
            html += `<div class="isbar-field isbar-field-boolean">${isbarFieldInputHtml(field, mode, value)}</div>`;
        } else {
            html += `<div class="isbar-field">
                <label>${field.label}${requiredMark}</label>
                ${isbarFieldInputHtml(field, mode, value)}
            </div>`;
        }
    });
    container.innerHTML = html || '<p class="isbar-empty-hint">No applicable fields.</p>';
}

function renderAllIsbarSections(mode) {
    ISBAR_METADATA_SECTIONS.forEach(section => renderIsbarSectionBody(mode, section.id));
    ISBAR_METADATA_SECTIONS.forEach(section => updateIsbarSectionStatus(mode, section.id));
}

// ── State updates ────────────────────────────────────────────────────────

function setIsbarFieldValue(mode, fieldId, value) {
    const state = isbarState[mode];
    if (value === '' || value === null || value === undefined) {
        delete state[fieldId];
    } else {
        state[fieldId] = value;
    }
    if (mode === 'add') isbarAddDirty = true;
}

function toggleIsbarCheckbox(mode, fieldId, token) {
    const state = isbarState[mode];
    const current = state[fieldId] ? String(state[fieldId]).split(',').map(t => t.trim()).filter(Boolean) : [];
    const idx = current.indexOf(token);
    if (idx >= 0) current.splice(idx, 1); else current.push(token);
    setIsbarFieldValue(mode, fieldId, current.join(','));
}

// Fields whose value can gate another field's visibility — only these need
// to trigger a full section re-render; plain text/number/datetime edits
// only update the status badge, preserving focus/cursor position.
function isbarSectionOfField(fieldId) {
    return ISBAR_METADATA_SECTIONS.find(s => s.fields.some(f => f.id === fieldId));
}

document.addEventListener('input', function(e) {
    const el = e.target;
    if (!el.classList || !el.classList.contains('isbar-input')) return;
    const fieldId = el.dataset.fieldId, mode = el.dataset.mode;
    if (!fieldId || !mode) return;
    setIsbarFieldValue(mode, fieldId, el.value.trim());
    updateIsbarSectionStatus(mode, isbarSectionOfField(fieldId)?.id);
});

document.addEventListener('change', function(e) {
    const el = e.target;
    if (el.type === 'checkbox' && el.dataset.fieldId && ISBAR_FIELD_BY_ID[el.dataset.fieldId]?.type === 'boolean') {
        setIsbarFieldValue(el.dataset.mode, el.dataset.fieldId, el.checked);
        updateIsbarSectionStatus(el.dataset.mode, isbarSectionOfField(el.dataset.fieldId)?.id);
    }
});

document.addEventListener('click', function(e) {
    const radioBtn = e.target.closest('[data-radio-value]');
    if (radioBtn) {
        const fieldId = radioBtn.dataset.fieldId, mode = radioBtn.dataset.mode;
        setIsbarFieldValue(mode, fieldId, radioBtn.dataset.radioValue);
        renderIsbarSectionBody(mode, isbarSectionOfField(fieldId).id);
        updateIsbarSectionStatus(mode, isbarSectionOfField(fieldId).id);
        return;
    }
    const checkBtn = e.target.closest('[data-checkbox-value]');
    if (checkBtn) {
        const fieldId = checkBtn.dataset.fieldId, mode = checkBtn.dataset.mode;
        toggleIsbarCheckbox(mode, fieldId, checkBtn.dataset.checkboxValue);
        renderIsbarSectionBody(mode, isbarSectionOfField(fieldId).id);
        updateIsbarSectionStatus(mode, isbarSectionOfField(fieldId).id);
    }
});

// ── Section status ───────────────────────────────────────────────────────

function updateIsbarSectionStatus(mode, sectionId) {
    if (!sectionId) return;
    const section = ISBAR_METADATA_SECTIONS.find(s => s.id === sectionId);
    const el = document.getElementById(isbarSummaryId(mode, sectionId));
    if (!section || !el) return;
    const state = isbarState[mode];

    const visibleFields = section.fields.filter(f => isbarFieldVisible(f, state));
    const filled = visibleFields.filter(f => state[f.id] !== undefined && state[f.id] !== '');
    const missingRequired = visibleFields.filter(f =>
        f.requiredTier === 'conditional' && (state[f.id] === undefined || state[f.id] === ''));

    el.classList.remove('isbar-status-none', 'isbar-status-progress', 'isbar-status-missing');
    if (missingRequired.length > 0) {
        el.textContent = 'Missing required information';
        el.classList.add('isbar-status-missing');
        return;
    }
    if (filled.length === 0) {
        el.textContent = 'Not started';
        el.classList.add('isbar-status-none');
        return;
    }
    const summaryParts = filled.slice(0, 3).map(f => {
        if (f.type === 'checkbox-group' || f.type === 'radio-group') {
            const tokens = String(state[f.id]).split(',').map(t => t.trim()).slice(0, 2);
            return tokens.map(t => isbarOptionLabel(f, t)).join(', ');
        }
        if (f.type === 'boolean') return f.label;
        return String(state[f.id]).slice(0, 24);
    });
    el.textContent = `In progress · ${summaryParts.join(' · ')}`;
    el.classList.add('isbar-status-progress');
}

// ── Build payload / reset ────────────────────────────────────────────────

// Merges the metadata-driven state with the hand-written vitals-additions
// fields (blood_glucose, o2_support, o2_flow_rate, vitals_measured_at,
// vitals_recorded_by) that patients.js reads directly from their own input
// ids — see collectVitalsAdditions() in patients.js.
function buildIsbarPayload(mode, vitalsAdditions) {
    const state = isbarState[mode];
    const hasMetaData = Object.keys(state).length > 0;
    const hasVitalsData = vitalsAdditions && Object.values(vitalsAdditions).some(v => v !== null && v !== undefined && v !== '');
    if (!hasMetaData && !hasVitalsData) return null;

    const payload = Object.assign({}, state, vitalsAdditions || {});
    // receiver_ack is a real boolean on the wire; every other field is a string/number already.
    if ('receiver_ack' in payload) payload.receiver_ack = !!payload.receiver_ack;
    return payload;
}

function resetIsbarState(mode) {
    isbarState[mode] = {};
    if (mode === 'add') isbarAddDirty = false;
    ISBAR_METADATA_SECTIONS.forEach(section => {
        renderIsbarSectionBody(mode, section.id);
        updateIsbarSectionStatus(mode, section.id);
        const details = document.getElementById(`isbar-details-${section.id}-${mode}`);
        if (details) details.open = false;
    });
}

// Populates isbarState[mode] from a full ISBAR record (e.g. GET .../details)
// and re-renders every section — used when opening the edit modal.
function loadIsbarStateFromRecord(mode, isbarRecord) {
    isbarState[mode] = {};
    if (isbarRecord) {
        Object.keys(isbarRecord).forEach(k => {
            if (k === 'stay_id') return;
            const v = isbarRecord[k];
            if (v !== null && v !== undefined && v !== '') isbarState[mode][k] = v;
        });
    }
    renderAllIsbarSections(mode);
    ISBAR_METADATA_SECTIONS.forEach(section => {
        const details = document.getElementById(`isbar-details-${section.id}-${mode}`);
        if (details) details.open = false;
    });
}

// ── Unsaved-changes guard (add page only — the edit modal is a transient
// overlay closed via an explicit Cancel/X, not a page navigation) ─────────

window.addEventListener('beforeunload', function(e) {
    if (!isbarAddDirty) return;
    e.preventDefault();
    e.returnValue = '';
});

// Mounts the accordion markup into `#isbar-accordion-<mode>` and renders
// every section's initial (empty) state. Called once per mode at page load
// (add) or each time the edit modal opens (edit) — see patients.js.
function mountIsbarAccordion(mode) {
    const mount = document.getElementById(`isbar-accordion-${mode}`);
    if (!mount) return;
    mount.innerHTML = renderIsbarAccordionSections(mode);
    renderAllIsbarSections(mode);
}
