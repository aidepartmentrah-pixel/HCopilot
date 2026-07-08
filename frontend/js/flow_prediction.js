/**
 * flow_prediction.js — Patient Flow Prediction section for HCopilot.
 *
 * Displays a forecast of daily patient arrivals produced by the XGBoost model
 * trained in the backend (Flow_prediction.pkl).
 *
 * Responsibilities:
 *   loadFlowStats()       — fetch /api/flow-prediction/stats and render summary
 *                           stat cards (average / max / min / total records).
 *   loadFlowPrediction()  — fetch /api/flow-prediction/predict, merge historical
 *                           and predicted series, and draw a Chart.js line chart;
 *                           also populate the predictions table below the chart.
 *
 * Global state:
 *   flowChart — Chart.js instance; destroyed before each redraw to prevent
 *               canvas reuse errors when the section is visited multiple times.
 */

let flowChart = null;  // reference kept so the chart can be destroyed before re-drawing

async function loadFlowStats() {
    // Fetch and display summary statistics (avg / max / min / total records) in stat cards
    try {
        const response = await fetch('http://localhost:8090/api/flow-prediction/stats');
        const stats = await response.json();

        document.getElementById('flow-stats').innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-label">Average Daily Patients</div>
                    <div class="stat-value">${stats.avg_daily_patients.toFixed(1)}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Max Daily Patients</div>
                    <div class="stat-value">${stats.max_daily_patients}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Min Daily Patients</div>
                    <div class="stat-value">${stats.min_daily_patients}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Total Records</div>
                    <div class="stat-value">${stats.total_records}</div>
                </div>
            </div>
        `;
    } catch (error) {
        document.getElementById('flow-stats').innerHTML = `
            <div class="error-state"><p>Error loading statistics: ${error.message}</p></div>
        `;
    }
}

async function loadFlowPrediction(days) {
    // Fetch both historical (90 days) and predicted (N days) data in parallel,
    // then render them as a dual-line chart with historical in teal and predictions in red/dashed
    const container = document.getElementById('flow-predictions');
    container.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            Loading predictions for ${days} days...
        </div>
    `;

    try {
        const [predResponse, histResponse] = await Promise.all([
            fetch(`http://localhost:8090/api/flow-prediction/predict?days=${days}`),
            fetch('http://localhost:8090/api/flow-prediction/historical?days=90')
        ]);

        const predData = await predResponse.json();
        const histData = await histResponse.json();

        const historicalDates  = histData.historical.map(h => h.date);
        const historicalValues = histData.historical.map(h => h.actual_patients);

        const predictionDates  = predData.predictions.map(p => p.date);
        const predictionValues = predData.predictions.map(p => p.predicted_patients);

        // Destroy the previous chart instance before creating a new one to avoid canvas reuse errors
        if (flowChart) {
            flowChart.destroy();
        }

        const ctx = document.getElementById('flowChart').getContext('2d');
        flowChart = new Chart(ctx, {
            type: 'line',
            data: {
                // Labels span both historical and prediction date ranges
                labels: [...historicalDates, ...predictionDates],
                datasets: [
                    {
                        label: 'Historical Data',
                        // Fill prediction slots with null so historical line ends at the right date
                        data: [...historicalValues, ...Array(predictionDates.length).fill(null)],
                        borderColor: 'rgb(75, 192, 192)',
                        backgroundColor: 'rgba(75, 192, 192, 0.1)',
                        tension: 0.1,
                        borderWidth: 2
                    },
                    {
                        label: 'Predictions',
                        // Fill historical slots with null so prediction line starts where history ends
                        data: [...Array(historicalDates.length).fill(null), ...predictionValues],
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.1)',
                        borderDash: [5, 5],  // dashed line to distinguish predictions from actuals
                        tension: 0.1,
                        borderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    title: {
                        display: true,
                        text: `Patient Flow: Historical vs Predicted (${days} days)`,
                        font: { size: 16 }
                    },
                    legend: { display: true, position: 'top' }
                },
                scales: {
                    y: { beginAtZero: false, title: { display: true, text: 'Number of Patients' } },
                    x: { title: { display: true, text: 'Date' }, ticks: { maxTicksLimit: 15 } }
                }
            }
        });

        // Render a detailed breakdown table below the chart
        container.innerHTML = `
            <div class="predictions-table">
                <h3>Predicted Patient Flow (Next ${days} Days)</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Day of Week</th>
                            <th>Predicted Patients</th>
                            <th>Temperature (°C)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${predData.predictions.map(p => `
                            <tr>
                                <td>${p.date}</td>
                                <td>${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][p.day_of_week]}</td>
                                <td><strong>${Math.round(p.predicted_patients)}</strong></td>
                                <td>${p.temperature.toFixed(1)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

    } catch (error) {
        container.innerHTML = `
            <div class="error-state">
                <div class="error-icon">❌</div>
                <h3>Error Loading Predictions</h3>
                <p>${error.message}</p>
            </div>
        `;
        showMessage(`Error loading predictions: ${error.message}`, 'error');
    }
}
