// Settings → Reset tab: selective or full system reset.
//
// Individual resets: each section has its own POST /api/reset/{endpoint} that
// clears specific CSV files (e.g. daily-patients, beds, relations).
//
// Full reset (doResetAll): POSTs to /api/reset/all after the user types "RESET"
// into the confirmation input.  This truncates every dataset CSV.
//
// confirmReset() opens a shared modal with a bullet list of what will be
// deleted.  executeReset() fires the actual request.

// API endpoint path for the pending reset (e.g. "daily-patients")
let _rstEndpoint = null;

function confirmReset(endpoint, title, detail) {
    _rstEndpoint = endpoint;
    document.getElementById('rst-modal-title').textContent = `Reset ${title}`;
    const list = document.getElementById('rst-modal-list');
    list.innerHTML = detail.split(',').map(s => `<li>${s.trim()}</li>`).join('');
    document.getElementById('rst-modal').style.display = 'block';
}

function closeRstModal() {
    document.getElementById('rst-modal').style.display = 'none';
    _rstEndpoint = null;
}

async function executeReset() {
    if (!_rstEndpoint) return;
    const btn = document.getElementById('rst-modal-confirm-btn');
    btn.disabled = true;
    btn.textContent = 'Resetting…';
    try {
        const res = await fetch(`/api/reset/${_rstEndpoint}`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Reset failed');
        closeRstModal();
        notifyDataChange('reset', data.message);
        showMessage(data.message || 'Reset complete', 'success');
    } catch (err) {
        showMessage(err.message || 'Reset failed. Please try again.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Yes, Reset';
    }
}

// Enable the "Reset Everything" button only when the user has typed exactly
// "RESET" — a deliberate safeguard against accidental full resets.
function checkResetAll() {
    const val = document.getElementById('rst-all-input').value.trim();
    document.getElementById('rst-all-btn').disabled = (val !== 'RESET');
}

async function doResetAll() {
    const btn = document.getElementById('rst-all-btn');
    btn.disabled = true;
    btn.textContent = 'Resetting…';
    try {
        const res = await fetch('/api/reset/all', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Reset failed');
        document.getElementById('rst-all-input').value = '';
        notifyDataChange('reset', data.message);
        showMessage(data.message || 'System fully reset', 'success');
    } catch (err) {
        showMessage(err.message || 'Reset failed. Please try again.', 'error');
    } finally {
        btn.disabled = true;
        btn.textContent = 'Reset Everything';
    }
}
