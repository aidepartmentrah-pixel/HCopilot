/**
 * settings_hospital_directory.js — Settings → Hospital Directory API tab.
 *
 * Manages the connection settings (base URL / API key / timeout / TLS
 * verify) for the external Hospital Directory API, via
 * /api/hospital-directory/config*, and the "Test Connection" check.
 *
 * The API key input is always left blank on load (never pre-filled with the
 * masked value) — a small caption under the field shows the masked current
 * key instead. Saving with the field left blank leaves the stored key
 * unchanged (see backend's ExternalApiConfigSave.api_key handling); typing a
 * new value replaces it.
 */

function _hdSetError(msg) {
    const el = document.getElementById('hd-form-error');
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
}

function toggleHdKeyVisibility() {
    const input = document.getElementById('hd-api-key');
    const btn   = document.getElementById('hd-key-toggle-btn');
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.textContent = showing ? '👁️' : '🙈';
}

async function loadHospitalDirectorySettings() {
    _hdSetError('');
    document.getElementById('hd-test-result').hidden = true;
    try {
        const res  = await fetch('/api/hospital-directory/config');
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'HTTP ' + res.status);

        document.getElementById('hd-base-url').value = data.base_url || '';
        document.getElementById('hd-api-key').value   = '';
        document.getElementById('hd-api-key').placeholder =
            data.api_key_masked ? `Current key: ${data.api_key_masked} — leave blank to keep it`
                                 : 'Leave unchanged to keep the current key';
        document.getElementById('hd-timeout').value    = data.timeout_seconds ?? 10;
        document.getElementById('hd-verify-tls').checked = data.verify_tls !== false;

        if (data.api_key_error === 'key_missing') {
            _hdSetError('A key is saved, but SETTINGS_ENCRYPTION_KEY is not set on this server — searches will fail until it is configured.');
        } else if (data.api_key_error === 'key_error') {
            _hdSetError('The stored API key could not be decrypted (was this database copied from a different environment?). Re-enter the key and save.');
        }

        _hdRenderLastTest(data.last_test_status, data.last_test_message, data.last_test_at);
    } catch (error) {
        _hdSetError('Error loading settings: ' + error.message);
    }
    await loadMiddleNameCandidates();
}

function _hdRenderLastTest(status, message, at) {
    const el = document.getElementById('hd-last-test');
    if (!status) { el.textContent = ''; return; }
    const when = at ? new Date(at).toLocaleString() : '';
    el.textContent = `Last test: ${status === 'success' ? '✅ success' : '❌ failure'}${message ? ' — ' + message : ''}${when ? ' (' + when + ')' : ''}`;
}

async function saveHospitalDirectorySettings() {
    _hdSetError('');
    const baseUrl = document.getElementById('hd-base-url').value.trim();
    if (!baseUrl) { _hdSetError('API Base URL is required.'); return; }

    const payload = {
        base_url:        baseUrl,
        timeout_seconds: parseInt(document.getElementById('hd-timeout').value, 10) || 10,
        verify_tls:      document.getElementById('hd-verify-tls').checked,
    };
    const apiKey = document.getElementById('hd-api-key').value;
    if (apiKey) payload.api_key = apiKey;

    const btn = document.getElementById('hd-save-btn');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
        const res  = await fetch('/api/hospital-directory/config/save', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'HTTP ' + res.status);
        showMessage(data.message || 'Settings saved', 'success');
        await loadHospitalDirectorySettings();
    } catch (error) {
        _hdSetError('Error saving settings: ' + error.message);
    } finally {
        btn.disabled = false; btn.textContent = '💾 Save Settings';
    }
}

async function testHospitalDirectoryConnection() {
    const resultEl = document.getElementById('hd-test-result');
    const btn = document.getElementById('hd-test-btn');
    btn.disabled = true; btn.textContent = 'Testing…';
    resultEl.hidden = true;
    try {
        const res  = await fetch('/api/hospital-directory/config/test-connection', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'HTTP ' + res.status);

        resultEl.hidden = false;
        resultEl.className = 'hd-test-result ' + (data.success ? 'hd-result-ok' : 'hd-result-fail');
        resultEl.innerHTML = `<div class="hd-test-result-title">${data.success ? '✅ Success' : '❌ Failed'}</div>${data.message || ''}`;

        _hdRenderLastTest(data.success ? 'success' : 'failure', data.message, new Date().toISOString());
    } catch (error) {
        resultEl.hidden = false;
        resultEl.className = 'hd-test-result hd-result-fail';
        resultEl.innerHTML = `<div class="hd-test-result-title">❌ Failed</div>Network error: ${error.message}`;
    } finally {
        btn.disabled = false; btn.textContent = '▶ Test Connection';
    }
}

function _hdCandidatesSetError(msg) {
    const el = document.getElementById('hd-candidates-error');
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
}

async function loadMiddleNameCandidates() {
    _hdCandidatesSetError('');
    try {
        const res  = await fetch('/api/hospital-directory/config/middle-name-candidates');
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'HTTP ' + res.status);
        document.getElementById('hd-candidates-textarea').value = (data.names || []).join('\n');
    } catch (error) {
        _hdCandidatesSetError('Error loading candidate list: ' + error.message);
    }
}

async function saveMiddleNameCandidates() {
    _hdCandidatesSetError('');
    const names = document.getElementById('hd-candidates-textarea').value
        .split('\n').map(s => s.trim()).filter(Boolean);

    const btn = document.getElementById('hd-candidates-save-btn');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
        const res  = await fetch('/api/hospital-directory/config/middle-name-candidates', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ names })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'HTTP ' + res.status);
        document.getElementById('hd-candidates-textarea').value = (data.names || []).join('\n');
        showMessage(`Saved ${data.names.length} candidate name(s)`, 'success');
    } catch (error) {
        _hdCandidatesSetError('Error saving candidate list: ' + error.message);
    } finally {
        btn.disabled = false; btn.textContent = '💾 Save List';
    }
}
