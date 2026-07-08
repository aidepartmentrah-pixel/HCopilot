// Reusable "Change Bed" modal — lets any section move an already-assigned
// patient to a different bed without touching their doctor/nurse links.
// Triggered from Beds Display and the Settings Daily Patients tab.

let cbPatientId    = null;
let cbOldBedId     = null;

window.addEventListener('click', function(e) {
    if (e.target === document.getElementById('change-bed-modal')) closeChangeBedModal();
});

async function openChangeBedModal(patientId, oldBedId, oldBedLabel) {
    cbPatientId = patientId;
    cbOldBedId  = oldBedId;

    document.getElementById('cb-info').innerHTML =
        `Patient <strong>#${patientId}</strong> is currently in <strong>Bed ${oldBedLabel ?? oldBedId}</strong>. Select a new bed below.`;
    document.getElementById('cb-error').textContent = '';

    const sel = document.getElementById('cb-new-bed-select');
    sel.innerHTML = '<option value="">Loading beds…</option>';
    document.getElementById('change-bed-modal').style.display = 'block';

    try {
        const res  = await fetch('http://localhost:8090/api/beds/list');
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to load beds');

        const available = (data.beds || []).filter(b => b.bed_status === 'Available' && b.bed_id !== oldBedId);
        if (!available.length) {
            sel.innerHTML = '<option value="">No available beds</option>';
            return;
        }
        sel.innerHTML = available.map(b => {
            const btype = b.bed_type || 'normal';
            const ward  = b.ward_name || (b.ward_id != null ? `Ward ${b.ward_id}` : 'Unassigned');
            return `<option value="${b.bed_id}">🛏️ ${b.bed_number} [${btype}] · ${ward}</option>`;
        }).join('');
    } catch (err) {
        sel.innerHTML = '<option value="">Error loading beds</option>';
        document.getElementById('cb-error').textContent = err.message;
    }
}

function closeChangeBedModal() {
    document.getElementById('change-bed-modal').style.display = 'none';
    cbPatientId = null;
    cbOldBedId  = null;
}

async function confirmChangeBed() {
    const sel       = document.getElementById('cb-new-bed-select');
    const errEl     = document.getElementById('cb-error');
    const newBedId  = parseInt(sel.value);

    if (!newBedId || isNaN(newBedId)) {
        errEl.textContent = 'Please select a bed.';
        return;
    }
    errEl.textContent = '';

    const btn = document.getElementById('cb-confirm-btn');
    btn.disabled = true;
    btn.textContent = 'Moving…';

    try {
        const res = await fetch(`http://localhost:8090/api/beds/move/${cbPatientId}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ new_bed_id: newBedId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to move patient');

        showMessage(data.message, 'success');
        notifyDataChange('beds', data.message);
        closeChangeBedModal();
        if (typeof closeBedModal === 'function') closeBedModal();
    } catch (err) {
        errEl.textContent = err.message;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Move Patient';
    }
}
