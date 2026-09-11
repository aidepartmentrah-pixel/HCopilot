/**
 * model_training.js — Settings → Training tab for HCopilot.
 *
 * Retrains the Flow Prediction XGBoost model via the training engine API,
 * shows the currently-live model's accuracy, and manages training run
 * history (export / promote / delete). All backed by /api/model-training.
 *
 * Responsibilities:
 *   loadModelTraining() — GET /live + GET /runs, render both panels.
 *   startTraining()     — POST /train; guards against double-click and
 *                         surfaces a concurrent-run 409 with a short poll.
 *   exportRun(id)        — download a run's .pkl via a throwaway <a>.
 *   confirmPromote/doPromoteRun, confirmDelete/doDeleteRun — modal-gated
 *                         row actions, mirroring settings_groups.js's
 *                         confirmDeleteGroup/doDeleteGroup pattern.
 */

const TRAINING_API   = '/api/model-training';
const TRAINING_MODEL = 'flow_prediction';

let _trainingDeletePendingId  = null;
let _trainingPromotePendingId = null;
let _trainingStatusPollTimer  = null;

window.addEventListener('click', function(e) {
    if (e.target === document.getElementById('training-delete-modal'))  closeTrainingDeleteModal();
    if (e.target === document.getElementById('training-promote-modal')) closeTrainingPromoteModal();
});

async function loadModelTraining() {
    await Promise.all([loadLiveModelStats(), loadTrainingHistory()]);
}

// GET /live returning 404 is the expected fresh-install state (no run has
// ever been recorded as live yet) — treated as an empty state, not an error.
async function loadLiveModelStats() {
    const container = document.getElementById('training-live-stats');
    try {
        const res = await fetch(`${TRAINING_API}/live?model_name=${TRAINING_MODEL}`);
        if (res.status === 404) {
            renderLiveStats(null);
            return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(parseApiError(data.detail));
        renderLiveStats(data);
    } catch (error) {
        container.innerHTML = `
            <div class="error-state">
                <div class="error-icon">❌</div>
                <h3>Error Loading Live Model</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

function renderLiveStats(run) {
    const container = document.getElementById('training-live-stats');

    if (!run) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🧠</div>
                <h3>No Live Model Recorded Yet</h3>
                <p>Train the model to deploy your first live version.</p>
            </div>
        `;
        return;
    }

    const m = run.metrics || {};
    container.innerHTML = `
        <div class="training-live-meta">
            Run <span class="model-path">${run.run_id}</span> ·
            trained ${new Date(run.finished_at).toLocaleString()} ·
            ${run.row_count_train ?? '—'} train / ${run.row_count_test ?? '—'} test rows
            (data through ${run.train_data_end || '—'})
        </div>
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-label">MAE</div>
                <div class="stat-value">${_fmtMetric(m.mae, 2)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">RMSE</div>
                <div class="stat-value">${_fmtMetric(m.rmse, 2)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">R²</div>
                <div class="stat-value">${_fmtMetric(m.r2, 3)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">MAPE</div>
                <div class="stat-value">${_fmtMetric(m.mape, 1, '%')}</div>
            </div>
        </div>
    `;
}

// Shared by renderLiveStats/renderRunHistory so a null metric (e.g. on a
// failed run) renders "—" instead of "NaN"/"undefined".
function _fmtMetric(value, decimals, suffix) {
    return (value === null || value === undefined) ? '—' : value.toFixed(decimals) + (suffix || '');
}

function _capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

async function loadTrainingHistory() {
    const container = document.getElementById('training-history-container');
    try {
        const res  = await fetch(`${TRAINING_API}/runs?model_name=${TRAINING_MODEL}&limit=50`);
        const data = await res.json();
        if (!res.ok) throw new Error(parseApiError(data.detail));
        renderRunHistory(data.runs);
    } catch (error) {
        container.innerHTML = `
            <div class="error-state">
                <div class="error-icon">❌</div>
                <h3>Error Loading Training History</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

const _STATUS_CLASS = { completed: 'mt-status-completed', failed: 'mt-status-failed' };

function renderRunHistory(runs) {
    const container = document.getElementById('training-history-container');

    if (!runs.length) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📋</div>
                <h3>No Training Runs Yet</h3>
                <p>Click "Train Now" to run your first training job.</p>
            </div>
        `;
        return;
    }

    const rows = runs.map(run => {
        const m = run.metrics || {};
        const statusCls  = _STATUS_CLASS[run.status] || 'mt-status-running';
        const liveBadge  = run.is_live ? '<span class="mt-live-badge">LIVE</span>' : '';

        // Buttons are hidden (not disabled) whenever they'd otherwise hit a
        // predictable backend error: no Export without an artifact, no
        // Promote for a non-completed or already-live run, no Delete for
        // the live run (the backend blocks that with a 409 — this keeps
        // the UI from ever reaching it).
        const actions = [];
        if (run.artifact_path) {
            actions.push(`<button class="s-action-btn s-export-btn" onclick="exportRun('${run.run_id}')">⬇️ Export</button>`);
        }
        if (run.status === 'completed' && !run.is_live) {
            actions.push(`<button class="s-action-btn s-promote-btn" onclick="confirmPromote('${run.run_id}')">⬆️ Promote</button>`);
        }
        if (!run.is_live) {
            actions.push(`<button class="s-action-btn s-del-btn" onclick="confirmDelete('${run.run_id}')">🗑️ Delete</button>`);
        }

        return `<tr>
            <td>
                ${new Date(run.started_at).toLocaleString()}<br>
                <span class="model-path">${run.run_id}</span>
            </td>
            <td><span class="mt-status-badge ${statusCls}">${_capitalize(run.status)}</span>${liveBadge}</td>
            <td>${_fmtMetric(m.mae, 2)}</td>
            <td>${_fmtMetric(m.rmse, 2)}</td>
            <td>${_fmtMetric(m.r2, 3)}</td>
            <td>${_fmtMetric(m.mape, 1, '%')}</td>
            <td class="s-td-actions">${actions.join('')}</td>
        </tr>`;
    }).join('');

    container.innerHTML =
        '<div class="s-table-wrap"><table class="s-table">' +
        '<thead><tr><th>Run</th><th>Status</th><th>MAE</th><th>RMSE</th><th>R²</th><th>MAPE</th><th style="width:220px">Actions</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
}

// ── Train Now ────────────────────────────────────────────────────────────

async function startTraining() {
    const btn = document.getElementById('train-now-btn');
    if (btn.disabled) return;

    const originalLabel = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner spinner-sm"></span>Training…';

    try {
        const res  = await fetch(`${TRAINING_API}/train?model_name=${TRAINING_MODEL}`, { method: 'POST' });
        const data = await res.json();

        if (res.status === 409) {
            // A DIFFERENT caller's run is already in progress — our own
            // request above already blocks until our own run finishes, so
            // this branch never fires for our own call. Poll briefly so
            // the button recovers once the other run clears, instead of
            // staying stale until a manual Refresh.
            showMessage(parseApiError(data.detail), 'error');
            _pollTrainingStatus(btn, originalLabel);
            return;
        }
        if (!res.ok) throw new Error(parseApiError(data.detail));

        showMessage(`Training completed — MAE ${data.metrics.mae.toFixed(2)}`, 'success');
        loadModelTraining();
    } catch (error) {
        showMessage(`Error training model: ${error.message}`, 'error');
    } finally {
        if (!_trainingStatusPollTimer) {
            btn.disabled = false;
            btn.innerHTML = originalLabel;
        }
    }
}

function _pollTrainingStatus(btn, originalLabel) {
    let attempts = 0;
    _trainingStatusPollTimer = setInterval(async () => {
        attempts++;
        try {
            const res  = await fetch(`${TRAINING_API}/status`);
            const data = await res.json();
            if (!data.training_in_progress || attempts >= 5) {
                clearInterval(_trainingStatusPollTimer);
                _trainingStatusPollTimer = null;
                btn.disabled = false;
                btn.innerHTML = originalLabel;
                if (!data.training_in_progress) loadModelTraining();
            }
        } catch (_) {
            clearInterval(_trainingStatusPollTimer);
            _trainingStatusPollTimer = null;
            btn.disabled = false;
            btn.innerHTML = originalLabel;
        }
    }, 2000);
}

// ── Export ───────────────────────────────────────────────────────────────

// A throwaway <a download> click, not window.location.href — a direct
// location assignment on a 404 (artifact pruned/deleted after the button
// was rendered) would navigate the whole single-page app away to raw JSON.
function exportRun(runId) {
    const a = document.createElement('a');
    a.href = `${TRAINING_API}/runs/${encodeURIComponent(runId)}/export`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

// ── Promote ──────────────────────────────────────────────────────────────

function confirmPromote(runId) {
    _trainingPromotePendingId = runId;
    document.getElementById('promote-run-label').textContent = runId;
    document.getElementById('training-promote-modal').style.display = 'block';
}

function closeTrainingPromoteModal() {
    _trainingPromotePendingId = null;
    document.getElementById('training-promote-modal').style.display = 'none';
}

async function doPromoteRun() {
    const runId = _trainingPromotePendingId;
    if (!runId) return;
    closeTrainingPromoteModal();
    try {
        const res  = await fetch(`${TRAINING_API}/runs/${encodeURIComponent(runId)}/promote`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(parseApiError(data.detail));
        showMessage(`Promoted run ${runId} to live`, 'success');
        loadModelTraining();
    } catch (error) {
        showMessage(`Error promoting run: ${error.message}`, 'error');
    }
}

// ── Delete ───────────────────────────────────────────────────────────────

function confirmDelete(runId) {
    _trainingDeletePendingId = runId;
    document.getElementById('delete-run-label').textContent = runId;
    document.getElementById('training-delete-modal').style.display = 'block';
}

function closeTrainingDeleteModal() {
    _trainingDeletePendingId = null;
    document.getElementById('training-delete-modal').style.display = 'none';
}

async function doDeleteRun() {
    const runId = _trainingDeletePendingId;
    if (!runId) return;
    closeTrainingDeleteModal();
    try {
        const res  = await fetch(`${TRAINING_API}/runs/${encodeURIComponent(runId)}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(parseApiError(data.detail));
        showMessage(`Deleted run ${runId}`, 'success');
        loadModelTraining();
    } catch (error) {
        showMessage(`Error deleting run: ${error.message}`, 'error');
    }
}
