/**
 * model_files.js — Settings → Models tab for HCopilot.
 *
 * Fetches metadata for every .pkl model file found in backend/models/AIModels/
 * and renders a card grid showing each file's name, size, and last-modified date.
 * This gives operators a quick way to confirm that the expected model files
 * (e.g. Flow_prediction.pkl) are present before running predictions.
 *
 * Responsibilities:
 *   loadModelFiles() — GET /api/models/list, then render one card per .pkl file
 *                      or an empty-state message if no files are found.
 */

async function loadModelFiles() {
    const container = document.getElementById('models-container');

    try {
        const response = await fetch('http://localhost:8090/api/models/list');
        const result   = await response.json();

        if (!response.ok) {
            throw new Error(result.error || `HTTP ${response.status}`);
        }

        if (result.count === 0) {
            // No models on disk yet — show an informational empty state
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📁</div>
                    <h3>No Model Files Found</h3>
                    <p>No PKL model files are currently stored in the system.</p>
                </div>
            `;
            return;
        }

        // Render one card per .pkl file showing name, size, and last-modified date
        container.innerHTML = `
            <div class="models-grid">
                ${result.models.map(model => `
                    <div class="model-card">
                        <div class="model-icon">🤖</div>
                        <div class="model-info">
                            <h3 class="model-name">${model.name}</h3>
                            <div class="model-details">
                                <div class="model-detail">
                                    <span class="detail-label">Size:</span>
                                    <span class="detail-value">${model.size_mb} MB</span>
                                </div>
                                <div class="model-detail">
                                    <span class="detail-label">Modified:</span>
                                    <span class="detail-value">${new Date(model.modified).toLocaleString()}</span>
                                </div>
                                <div class="model-detail">
                                    <span class="detail-label">Path:</span>
                                    <span class="detail-value model-path">${model.path}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="models-summary">
                <p>📊 Total Models: <strong>${result.count}</strong></p>
            </div>
        `;

    } catch (error) {
        container.innerHTML = `
            <div class="error-state">
                <div class="error-icon">❌</div>
                <h3>Error Loading Models</h3>
                <p>${error.message}</p>
            </div>
        `;
        showMessage(`Error loading model files: ${error.message}`, 'error');
    }
}
