// Statistics & Evaluation section
//
// Three-tab layout: Patients | Nurses | Doctors
//   Patients — 7 ED KPI panels: wait-to-bed distribution, LOS distribution, ESI acuity
//              breakdown, hourly/daily throughput, top chief complaints, vital sign
//              summary, and a data-quality warning banner.
//   Nurses   — headcount KPIs, role distribution doughnut, shift distribution,
//              patient-load table, and an individual nurse profile lookup card.
//   Doctors  — same structure as Nurses, with type (attending vs intern) distribution.
//
// Tab access is per-user: userStatisticsTabs() (auth.js) returns which of the three
// tabs the logged-in user may see.  Inaccessible tabs are hidden on every load, and
// the section opens directly on the first accessible tab.
//
// Staff charts (nurseRoleChart, doctorTypeChart) are drawn lazily in switchStatsTab()
// because Chart.js cannot measure a canvas that is inside a display:none pane.
// Staff data is cached in _staffData so repeated tab switches don't re-fetch.
//
// Fetches all metrics from /api/statistics/* endpoints.

const STATS_BASE = '/api/statistics';

// Chart instances — kept so we can destroy & re-create on refresh
let _waitChart = null;
let _losChart  = null;
let _acuityChart = null;
let _throughputChart = null;
let _nurseRoleChart = null;
let _doctorTypeChart = null;

// Staff data cached here so charts can be drawn lazily when their tab opens
let _staffData = null;

// Run a render function without letting it crash the whole load pipeline.
function _safeRender(label, fn) {
    try { fn(); } catch (e) { console.warn(`[statistics] ${label}:`, e); }
}

async function loadStatistics() {
    _renderKpiLoading();

    // ── Tab access control: hide buttons/panes for tabs this user cannot access ──
    const _allowedStatsTabs = (typeof userStatisticsTabs === 'function')
        ? userStatisticsTabs()
        : ['patients', 'nurses', 'doctors'];

    document.querySelectorAll('.stats-main-tab[data-stats-tab]').forEach(btn => {
        const allowed = _allowedStatsTabs.includes(btn.dataset.statsTab);
        btn.style.display = allowed ? '' : 'none';
    });
    document.querySelectorAll('.stats-main-tab-pane[id^="stats-tab-"]').forEach(pane => {
        const tabId = pane.id.replace('stats-tab-', '');
        if (!_allowedStatsTabs.includes(tabId)) pane.classList.remove('active');
    });

    // If the currently active tab is not accessible, switch to the first allowed one
    const activeBtn   = document.querySelector('.stats-main-tab.active');
    const activeTabId = activeBtn ? activeBtn.dataset.statsTab : null;
    if (!activeTabId || !_allowedStatsTabs.includes(activeTabId)) {
        // Find the first button whose tab is actually in the allowed list (not just the first in the DOM)
        const firstAllowedBtn = _allowedStatsTabs.reduce((found, tabId) => {
            return found || document.querySelector(`.stats-main-tab[data-stats-tab="${tabId}"]`);
        }, null);
        if (firstAllowedBtn) switchStatsTab(firstAllowedBtn.dataset.statsTab, firstAllowedBtn);
    }

    // ── Step 1: fetch the 7 core patient-stat endpoints ────────────────────
    // Staff-stats is deliberately excluded so a slow or failing staff endpoint
    // never delays or blocks the patient statistics.
    let overview, waitTimes, acuity, throughput, complaints, vitals, quality;
    try {
        [overview, waitTimes, acuity, throughput, complaints, vitals, quality] = await Promise.all([
            fetch(`${STATS_BASE}/overview`).then(r => r.json()),
            fetch(`${STATS_BASE}/waiting-times`).then(r => r.json()),
            fetch(`${STATS_BASE}/acuity-breakdown`).then(r => r.json()),
            fetch(`${STATS_BASE}/throughput`).then(r => r.json()),
            fetch(`${STATS_BASE}/top-complaints`).then(r => r.json()),
            fetch(`${STATS_BASE}/vitals-summary`).then(r => r.json()),
            fetch(`${STATS_BASE}/data-quality`).then(r => r.json()),
        ]);
    } catch (err) {
        document.getElementById('stats-kpi-grid').innerHTML =
            `<div class="stats-no-data"><span class="stats-no-data-icon">⚠️</span>Failed to load statistics. Is the server running?</div>`;
        console.error('Statistics fetch error:', err);
        return;
    }

    // ── Step 2: render patient stats — each call isolated ──────────────────
    _safeRender('quality banner', () => _renderDataQualityBanner(quality));
    _safeRender('kpis',           () => _renderKpis(overview));
    _safeRender('wait chart',     () => _renderWaitChart(waitTimes.wait_to_bed));
    _safeRender('los chart',      () => _renderLosChart(waitTimes.length_of_stay));
    _safeRender('acuity',         () => _renderAcuitySection(acuity.acuity_breakdown));
    _safeRender('throughput',     () => _renderThroughputChart(throughput));
    _safeRender('complaints',     () => _renderComplaints(complaints.complaints, overview));
    _safeRender('vitals',         () => _renderVitals(vitals));

    // ── Step 3: staff stats — fires independently, never blocks patient UI ─
    fetch(`${STATS_BASE}/staff-stats`)
        .then(r => r.json())
        .then(staff => {
            _safeRender('staff stats', () => _renderStaffStats(staff));
            _initStaffSelectors();
        })
        .catch(err => console.warn('[statistics] staff-stats failed:', err));
}

function _renderDataQualityBanner(q) {
    const el = document.getElementById('stats-quality-banner');
    if (!el) return;

    if (q.total_records === 0) {
        el.style.display = 'none';
        return;
    }

    const broken = q.total_records - q.clean_records;
    if (q.quality_pct >= 80) {
        el.style.display = 'none';
        return;
    }

    const parts = [];
    if (q.missing_arrival > 0)    parts.push(`${q.missing_arrival} missing arrival time`);
    if (q.inverted_departure > 0) parts.push(`${q.inverted_departure} departure before arrival`);
    if (q.inverted_bed > 0)       parts.push(`${q.inverted_bed} bed assigned before arrival`);

    el.style.display = 'flex';
    el.innerHTML = `
        <span class="quality-banner-icon">⚠️</span>
        <div>
            <strong>Data quality warning:</strong> ${broken} of ${q.total_records} patient records
            (${100 - q.quality_pct}%) have inconsistent timestamps —
            ${parts.join(', ')}.
            Time-based metrics (avg wait, avg LOS) are computed from the
            <strong>${q.valid_los_samples} valid records</strong> only and may not be representative.
            Ensure <em>arrival_time</em> is recorded at patient admission.
        </div>`;
}

// ── KPI Cards ────────────────────────────────────────────────────────────────

function _renderKpiLoading() {
    document.getElementById('stats-kpi-grid').innerHTML =
        `<div class="loading"><div class="spinner"></div> Loading metrics...</div>`;
}

function _fmt(val, unit = '', decimals = 1) {
    if (val == null) return '—';
    return `${(+val).toFixed(decimals)}${unit}`;
}

function _acuityColor(avg) {
    if (avg == null) return '';
    if (avg <= 2) return 'danger';
    if (avg <= 3) return 'warn';
    return 'good';
}

function _renderKpis(d) {
    const waitClass = d.avg_wait_to_bed_min == null ? '' :
        d.avg_wait_to_bed_min > 240 ? 'danger' : d.avg_wait_to_bed_min > 60 ? 'warn' : 'good';
    const occClass = d.occupancy_rate == null ? '' :
        d.occupancy_rate > 90 ? 'danger' : d.occupancy_rate > 75 ? 'warn' : 'good';

    document.getElementById('stats-kpi-grid').innerHTML = `
        <div class="stats-kpi-card">
            <div class="stats-kpi-icon">🏥</div>
            <div class="stats-kpi-label">Active Patients</div>
            <div class="stats-kpi-value">${d.active_patients ?? '—'}</div>
            <div class="stats-kpi-sub">currently in ED</div>
        </div>
        <div class="stats-kpi-card">
            <div class="stats-kpi-icon">📋</div>
            <div class="stats-kpi-label">Discharged (Total)</div>
            <div class="stats-kpi-value">${d.historical_patients ?? '—'}</div>
            <div class="stats-kpi-sub">in log archive</div>
        </div>
        <div class="stats-kpi-card">
            <div class="stats-kpi-icon">⏱️</div>
            <div class="stats-kpi-label">Avg Wait to Bed</div>
            <div class="stats-kpi-value ${waitClass}">${_fmt(d.avg_wait_to_bed_min, ' min')}</div>
            <div class="stats-kpi-sub">${d.wait_sample_count} samples</div>
        </div>
        <div class="stats-kpi-card">
            <div class="stats-kpi-icon">🕐</div>
            <div class="stats-kpi-label">Avg Length of Stay</div>
            <div class="stats-kpi-value">${_fmt(d.avg_los_hours, ' h', 1)}</div>
            <div class="stats-kpi-sub">${d.los_sample_count} discharged</div>
        </div>
        <div class="stats-kpi-card">
            <div class="stats-kpi-icon">🛏️</div>
            <div class="stats-kpi-label">Occupancy Rate</div>
            <div class="stats-kpi-value ${occClass}">${_fmt(d.occupancy_rate, '%')}</div>
            <div class="stats-kpi-sub">of total beds</div>
        </div>
        <div class="stats-kpi-card">
            <div class="stats-kpi-icon">🔴</div>
            <div class="stats-kpi-label">Avg Acuity (ESI)</div>
            <div class="stats-kpi-value ${_acuityColor(d.avg_acuity)}">${_fmt(d.avg_acuity, '', 2)}</div>
            <div class="stats-kpi-sub">1=critical 5=minor</div>
        </div>
        <div class="stats-kpi-card">
            <div class="stats-kpi-icon">⚠️</div>
            <div class="stats-kpi-label">Long Waits (&gt;4 h)</div>
            <div class="stats-kpi-value ${d.long_wait_pct > 20 ? 'danger' : d.long_wait_pct > 10 ? 'warn' : 'good'}">${_fmt(d.long_wait_pct, '%')}</div>
            <div class="stats-kpi-sub">of wait samples</div>
        </div>
    `;
}

// ── Wait Time Distribution Chart ──────────────────────────────────────────────

function _renderWaitChart(data) {
    const meta = document.getElementById('wait-chart-meta');
    if (meta) {
        meta.innerHTML = data.avg_minutes != null
            ? `<span>Avg: ${data.avg_minutes} min</span><span>Median: ${data.median_minutes} min</span><span>n=${data.sample_count}</span>`
            : `<span>No data yet</span>`;
    }

    if (_waitChart) { _waitChart.destroy(); _waitChart = null; }
    const ctx = document.getElementById('waitTimeChart');
    if (!ctx) return;

    const labels = Object.keys(data.distribution);
    const values = Object.values(data.distribution);

    if (values.every(v => v === 0)) {
        ctx.parentElement.insertAdjacentHTML('beforeend',
            '<p class="stats-no-data" style="margin-top:-10px">No wait-time data available yet.</p>');
        return;
    }

    _waitChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Patients',
                data: values,
                backgroundColor: ['#27ae60','#2ecc71','#f1c40f','#e67e22','#e74c3c','#c0392b'],
                borderRadius: 5,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 } },
                x: { grid: { display: false } }
            }
        }
    });
}

// ── Length of Stay Distribution Chart ────────────────────────────────────────

function _renderLosChart(data) {
    const meta = document.getElementById('los-chart-meta');
    if (meta) {
        meta.innerHTML = data.avg_hours != null
            ? `<span>Avg: ${data.avg_hours} h</span><span>n=${data.sample_count}</span>`
            : `<span>No data yet</span>`;
    }

    if (_losChart) { _losChart.destroy(); _losChart = null; }
    const ctx = document.getElementById('losChart');
    if (!ctx) return;

    const labels = Object.keys(data.distribution);
    const values = Object.values(data.distribution);

    if (values.every(v => v === 0)) {
        ctx.parentElement.insertAdjacentHTML('beforeend',
            '<p class="stats-no-data" style="margin-top:-10px">No discharged-patient data yet.</p>');
        return;
    }

    _losChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Patients',
                data: values,
                backgroundColor: '#667eea',
                borderRadius: 5,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 } },
                x: { grid: { display: false } }
            }
        }
    });
}

// ── Acuity Breakdown (table + doughnut) ──────────────────────────────────────

function _renderAcuitySection(breakdown) {
    if (_acuityChart) { _acuityChart.destroy(); _acuityChart = null; }
    const ctx = document.getElementById('acuityChart');
    if (!ctx) return;

    const colors = ['#c0392b', '#e67e22', '#f1c40f', '#2ecc71', '#27ae60'];
    const labels = breakdown.map(b => `ESI ${b.level}`);
    const counts = breakdown.map(b => b.count);
    const total  = counts.reduce((a, b) => a + b, 0);

    const tableEl = document.getElementById('acuity-breakdown-table');
    if (tableEl) {
        if (total === 0) {
            tableEl.innerHTML = '<p class="stats-no-data" style="padding:20px 0">No acuity data available yet.</p>';
        } else {
            tableEl.innerHTML = `
                <table class="stats-acuity-table">
                    <thead>
                        <tr>
                            <th>Level</th>
                            <th>Count</th>
                            <th>Avg Wait</th>
                            <th>Avg LOS</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${breakdown.map(b => `
                            <tr>
                                <td><span class="acuity-badge acuity-${b.level}">ESI ${b.level}</span></td>
                                <td>${b.count}</td>
                                <td>${b.avg_wait_min != null ? b.avg_wait_min + ' min' : '—'}</td>
                                <td>${b.avg_los_hours != null ? b.avg_los_hours + ' h' : '—'}</td>
                            </tr>`).join('')}
                    </tbody>
                </table>`;
        }
    }

    if (total === 0) return;

    _acuityChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: counts,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#fff',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { font: { size: 11 }, padding: 10 }
                }
            },
            cutout: '60%',
        }
    });
}

// ── Throughput by Hour Chart ──────────────────────────────────────────────────

function _renderThroughputChart(data) {
    const meta = document.getElementById('throughput-meta');
    if (meta) {
        meta.innerHTML = data.total_arrivals > 0
            ? `<span>Total arrivals tracked: ${data.total_arrivals}</span>`
            : `<span>No arrival data yet</span>`;
    }

    if (_throughputChart) { _throughputChart.destroy(); _throughputChart = null; }
    const ctx = document.getElementById('throughputChart');
    if (!ctx) return;

    const labels = Object.keys(data.by_hour).map(h => `${h.padStart(2,'0')}:00`);
    const values = Object.values(data.by_hour);

    _throughputChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Arrivals',
                data: values,
                backgroundColor: 'rgba(102, 126, 234, 0.7)',
                borderColor: '#667eea',
                borderWidth: 1,
                borderRadius: 3,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 } },
                x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 10 } } }
            }
        }
    });
}

// ── Top Complaints Table ──────────────────────────────────────────────────────

function _renderComplaints(complaints, overview) {
    const el = document.getElementById('stats-complaints');
    if (!el) return;

    if (!complaints || complaints.length === 0) {
        el.innerHTML = `
            <div class="stats-chart-title">Top Chief Complaints</div>
            <div class="stats-no-data"><span class="stats-no-data-icon">📝</span>No chief complaint data recorded yet.</div>`;
        return;
    }

    const maxCount = complaints[0].count;
    const rows = complaints.map(c => {
        const barW = Math.max(4, Math.round((c.count / maxCount) * 100));
        return `
            <tr>
                <td>
                    <div class="complaint-bar-wrap">
                        <div class="complaint-bar" style="width:${barW}px"></div>
                        <span>${c.complaint}</span>
                    </div>
                </td>
                <td style="text-align:right;font-weight:600">${c.count}</td>
                <td style="text-align:right;color:#888">${c.avg_los_hours != null ? c.avg_los_hours + ' h' : '—'}</td>
            </tr>`;
    }).join('');

    el.innerHTML = `
        <div class="stats-chart-title">Top Chief Complaints</div>
        <table class="stats-complaints-table">
            <thead>
                <tr>
                    <th>Complaint</th>
                    <th style="text-align:right">Count</th>
                    <th style="text-align:right">Avg LOS</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>`;
}

// ── Vitals Summary ────────────────────────────────────────────────────────────

const VITAL_LABELS = {
    temperature: 'Temperature',
    heartrate:   'Heart Rate',
    resprate:    'Resp. Rate',
    o2sat:       'O₂ Saturation',
    sbp:         'Systolic BP',
    dbp:         'Diastolic BP',
};

const VITAL_RANGES = {
    temperature: '36.1–37.5 °C',
    heartrate:   '60–100 bpm',
    resprate:    '12–20 br/min',
    o2sat:       '≥95 %',
    sbp:         '90–140 mmHg',
    dbp:         '60–90 mmHg',
};

function _renderVitals(data) {
    const el = document.getElementById('stats-vitals');
    if (!el) return;

    if (!data.vitals || Object.keys(data.vitals).length === 0) {
        el.innerHTML = `
            <div class="stats-chart-title">Current Patient Vitals (Avg)</div>
            <div class="stats-no-data"><span class="stats-no-data-icon">💊</span>No active patients with vital signs recorded.</div>`;
        return;
    }

    const items = Object.entries(data.vitals).map(([key, v]) => {
        const statusClass = v.normal ? 'normal' : 'abnormal';
        const statusText  = v.normal ? '✓ Normal' : '⚠ Abnormal';
        return `
            <div class="stats-vital-item ${statusClass}">
                <div class="stats-vital-name">${VITAL_LABELS[key] ?? key}</div>
                <div class="stats-vital-value">${v.avg}<span class="stats-vital-unit">${v.unit}</span></div>
                <div class="stats-vital-range">Normal: ${VITAL_RANGES[key] ?? ''}</div>
                <div class="stats-vital-status ${statusClass}">${statusText}</div>
            </div>`;
    }).join('');

    el.innerHTML = `
        <div class="stats-chart-title">Current Patient Vitals (Avg) <span style="font-size:12px;color:#aaa;font-weight:400">— ${data.count} active patients</span></div>
        <div class="stats-vitals-grid">${items}</div>`;
}

// ── Staff Statistics ──────────────────────────────────────────────────────────

function switchStatsTab(tab, btn) {
    if (typeof canAccessStatisticsTab === 'function' && !canAccessStatisticsTab(tab)) return;
    document.querySelectorAll('.stats-main-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.stats-main-tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`stats-tab-${tab}`)?.classList.add('active');

    // Render staff charts now that the canvas is visible
    if (_staffData) {
        if (tab === 'nurses')  _renderNurseRoleChart(_staffData.nurses);
        if (tab === 'doctors') _renderDoctorTypeChart(_staffData.doctors);
    }
}

function _renderStaffStats(data) {
    _staffData = data;  // cache for lazy chart rendering on tab open
    const { nurses, doctors } = data;
    _renderNurseKpis(nurses);
    _renderDoctorKpis(doctors);
    // Charts (nurseRoleChart, doctorTypeChart) are rendered in switchStatsTab
    // because Chart.js cannot measure a canvas inside a display:none pane.
    _renderLoadBlock('nurse-load-block',  nurses.patient_load_distribution,  nurses.avg_patients_per_active);
    _renderLoadBlock('doctor-load-block', doctors.patient_load_distribution, doctors.avg_patients_per_active);
    _renderSingleShiftDist('nurse-shift-dist',  nurses.shift_distribution);
    _renderSingleShiftDist('doctor-shift-dist', doctors.shift_distribution);
}

function _renderNurseKpis(n) {
    const el = document.getElementById('stats-nurse-kpis');
    if (!el) return;
    const absRate  = n.total > 0 ? Math.round(n.absent / n.total * 100) : 0;
    const absClass = absRate > 30 ? 'danger' : absRate > 15 ? 'warn' : 'good';
    const loadClass = n.avg_patients_per_active > 5 ? 'danger' : n.avg_patients_per_active > 3 ? 'warn' : 'good';
    el.innerHTML = `
        <div class="stats-staff-kpi-card">
            <div class="stats-staff-kpi-icon">👩‍⚕️</div>
            <div class="stats-staff-kpi-label">Total Nurses</div>
            <div class="stats-staff-kpi-value">${n.total}</div>
            <div class="stats-staff-kpi-sub">${n.active} active · ${n.absent} absent</div>
        </div>
        <div class="stats-staff-kpi-card">
            <div class="stats-staff-kpi-icon">✅</div>
            <div class="stats-staff-kpi-label">Active</div>
            <div class="stats-staff-kpi-value good">${n.active}</div>
            <div class="stats-staff-kpi-sub">on duty</div>
        </div>
        <div class="stats-staff-kpi-card">
            <div class="stats-staff-kpi-icon">📋</div>
            <div class="stats-staff-kpi-label">Absence Rate</div>
            <div class="stats-staff-kpi-value ${absClass}">${absRate}%</div>
            <div class="stats-staff-kpi-sub">${n.absent} absent</div>
        </div>
        <div class="stats-staff-kpi-card">
            <div class="stats-staff-kpi-icon">🔗</div>
            <div class="stats-staff-kpi-label">Avg Load</div>
            <div class="stats-staff-kpi-value ${loadClass}">${n.avg_patients_per_active}</div>
            <div class="stats-staff-kpi-sub">patients / active nurse</div>
        </div>
        <div class="stats-staff-kpi-card">
            <div class="stats-staff-kpi-icon">🏥</div>
            <div class="stats-staff-kpi-label">Patients Covered</div>
            <div class="stats-staff-kpi-value">${n.unique_patients_covered}</div>
            <div class="stats-staff-kpi-sub">${n.total_patient_assignments} assignments</div>
        </div>`;
}

function _renderDoctorKpis(d) {
    const el = document.getElementById('stats-doctor-kpis');
    if (!el) return;
    const absRate  = d.total > 0 ? Math.round(d.absent / d.total * 100) : 0;
    const absClass = absRate > 30 ? 'danger' : absRate > 15 ? 'warn' : 'good';
    const loadClass = d.avg_patients_per_active > 8 ? 'danger' : d.avg_patients_per_active > 5 ? 'warn' : 'good';
    el.innerHTML = `
        <div class="stats-staff-kpi-card">
            <div class="stats-staff-kpi-icon">🩺</div>
            <div class="stats-staff-kpi-label">Total Doctors</div>
            <div class="stats-staff-kpi-value">${d.total}</div>
            <div class="stats-staff-kpi-sub">${d.active} active · ${d.absent} absent</div>
        </div>
        <div class="stats-staff-kpi-card">
            <div class="stats-staff-kpi-icon">✅</div>
            <div class="stats-staff-kpi-label">Active</div>
            <div class="stats-staff-kpi-value good">${d.active}</div>
            <div class="stats-staff-kpi-sub">on duty</div>
        </div>
        <div class="stats-staff-kpi-card">
            <div class="stats-staff-kpi-icon">📋</div>
            <div class="stats-staff-kpi-label">Absence Rate</div>
            <div class="stats-staff-kpi-value ${absClass}">${absRate}%</div>
            <div class="stats-staff-kpi-sub">${d.absent} absent</div>
        </div>
        <div class="stats-staff-kpi-card">
            <div class="stats-staff-kpi-icon">🔗</div>
            <div class="stats-staff-kpi-label">Avg Load</div>
            <div class="stats-staff-kpi-value ${loadClass}">${d.avg_patients_per_active}</div>
            <div class="stats-staff-kpi-sub">patients / active doctor</div>
        </div>
        <div class="stats-staff-kpi-card">
            <div class="stats-staff-kpi-icon">🏥</div>
            <div class="stats-staff-kpi-label">Patients Covered</div>
            <div class="stats-staff-kpi-value">${d.unique_patients_covered}</div>
            <div class="stats-staff-kpi-sub">${d.total_patient_assignments} assignments</div>
        </div>`;
}

function _renderNurseRoleChart(nurses) {
    if (_nurseRoleChart) { _nurseRoleChart.destroy(); _nurseRoleChart = null; }
    const ctx = document.getElementById('nurseRoleChart');
    if (!ctx) return;

    const dist = nurses.role_distribution || {};
    const labels = Object.keys(dist);
    const values = Object.values(dist);
    if (labels.length === 0) return;

    const colors = ['#667eea','#764ba2','#27ae60','#e67e22','#e74c3c','#f1c40f'];
    _nurseRoleChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data: values, backgroundColor: colors.slice(0, labels.length), borderWidth: 2, borderColor: '#fff' }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 8 } },
                title: { display: true, text: 'By Role', font: { size: 12 }, color: '#666', padding: { bottom: 4 } }
            },
            cutout: '55%',
        }
    });
}

function _renderDoctorTypeChart(doctors) {
    if (_doctorTypeChart) { _doctorTypeChart.destroy(); _doctorTypeChart = null; }
    const ctx = document.getElementById('doctorTypeChart');
    if (!ctx) return;

    const dist = doctors.type_distribution || {};
    const labels = Object.keys(dist).map(k => k === 'intern' ? 'Intern' : 'Attending');
    const values = Object.values(dist);
    if (labels.length === 0) return;

    _doctorTypeChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data: values, backgroundColor: ['#3498db','#e67e22'], borderWidth: 2, borderColor: '#fff' }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 8 } },
                title: { display: true, text: 'By Type', font: { size: 12 }, color: '#666', padding: { bottom: 4 } }
            },
            cutout: '55%',
        }
    });
}

function _renderLoadBlock(elId, dist, avg) {
    const el = document.getElementById(elId);
    if (!el || !dist) return;

    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    const maxVal = Math.max(...Object.values(dist), 1);

    const rows = Object.entries(dist).map(([bucket, count]) => {
        const barW = Math.max(4, Math.round(count / maxVal * 80));
        const pct  = total > 0 ? Math.round(count / total * 100) : 0;
        return `
            <tr>
                <td style="white-space:nowrap;color:#555">${bucket} pts</td>
                <td>
                    <div class="staff-load-bar-wrap">
                        <div class="staff-load-bar" style="width:${barW}px"></div>
                        <span style="font-size:11px;color:#888">${pct}%</span>
                    </div>
                </td>
                <td style="text-align:right;font-weight:600">${count}</td>
            </tr>`;
    }).join('');

    el.innerHTML = `
        <div style="font-size:11px;color:#888;margin-bottom:6px">Avg: <strong style="color:#333">${avg}</strong> pts/active staff</div>
        <div style="font-size:11px;color:#aaa;margin-bottom:8px;font-style:italic">Points = number of assigned patients — the higher the number, the busier the staff member.</div>
        <table class="staff-load-table">
            <thead><tr><th>Load</th><th>Share</th><th style="text-align:right">Staff</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
}

function _renderSingleShiftDist(elId, dist) {
    const el = document.getElementById(elId);
    if (!el || !dist || Object.keys(dist).length === 0) return;

    const rows = Object.entries(dist).map(([shift, count]) => `
        <div class="stats-shift-row">
            <span class="stats-shift-label">${shift.charAt(0).toUpperCase() + shift.slice(1)}</span>
            <span class="stats-shift-count">${count}</span>
        </div>`).join('');

    el.innerHTML = `<div class="stats-shift-group" style="max-width:320px">${rows}</div>`;
}

// ── Staff Lookup ──────────────────────────────────────────────────────────────

// STAFF_BASE is already declared in utils.js — reuse it here.
const STATS_DETAIL_BASE = '/api/statistics/staff-member';


async function _populateStaffSelect(selectId, kind) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    try {
        const endpoint = kind === 'nurse'
            ? `${STAFF_BASE}/nurses/list`
            : `${STAFF_BASE}/doctors/list`;
        const data = await fetch(endpoint).then(r => r.json());
        const list = kind === 'nurse' ? (data.nurses || []) : (data.doctors || []);
        sel.innerHTML = `<option value="">— select a ${kind} —</option>` +
            list.map(m => {
                const label = m.name
                    ? m.name
                    : (kind === 'nurse' ? `Nurse #${m.id} (${m.role})` : `Doctor #${m.id} (${m.intern_or_not})`);
                const absentTag = m.absent ? ' [absent]' : '';
                return `<option value="${m.id}">${label}${absentTag}</option>`;
            }).join('');
    } catch {
        sel.innerHTML = `<option value="">Failed to load</option>`;
    }
}

async function loadStaffProfile(selectId, profileId, kind) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const id = sel.value;
    const el = document.getElementById(profileId);
    if (!el) return;
    if (!id) { el.innerHTML = ''; return; }

    el.innerHTML = `<div class="loading" style="padding:20px"><div class="spinner"></div> Loading...</div>`;
    try {
        const data = await fetch(`${STATS_DETAIL_BASE}/${kind}/${id}`).then(r => r.json());
        el.innerHTML = _buildProfileHTML(data, kind);
    } catch {
        el.innerHTML = `<p style="color:#e74c3c;font-size:13px;padding:10px">Failed to load staff details.</p>`;
    }
}

function _buildProfileHTML(data, kind) {
    const { member, patients, beds, ward_distribution } = data;
    const icon = kind === 'nurse' ? '👩‍⚕️' : '🩺';
    const displayName = member.name || (kind === 'nurse' ? `Nurse #${member.id}` : `Doctor #${member.id}`);
    const roleLabel = kind === 'nurse' ? member.role : (member.type === 'intern' ? 'Intern' : 'Attending Doctor');
    const _knownShifts = ['morning', 'night'];
    const shiftClass = _knownShifts.includes((member.shift || '').toLowerCase()) ? member.shift.toLowerCase() : '';
    const statusClass = member.absent ? 'absent' : 'active';
    const statusLabel = member.absent ? 'Absent' : 'Active';

    // Profile header
    let header = `
        <div class="staff-profile-header">
            <div class="staff-profile-avatar">${icon}</div>
            <div>
                <div class="staff-profile-name">${displayName}</div>
                <div class="staff-profile-meta">ID #${member.id} · ${member.group || '—'}</div>
                <div class="staff-profile-badges">
                    <span class="staff-badge">${roleLabel}</span>
                    <span class="staff-badge ${shiftClass}">${member.shift || '—'} shift</span>
                    <span class="staff-badge ${statusClass}">${statusLabel}</span>
                </div>
                ${member.free_time
                    ? `<div class="staff-free-time">🕐 Free since ${member.free_time}</div>`
                    : (patients.length === 0
                        ? `<div class="staff-free-time">🕐 Currently free (no patients assigned)</div>`
                        : '')}
            </div>
        </div>`;

    // Patients table
    const esiColors = {1:'esi-1',2:'esi-2',3:'esi-3',4:'esi-4',5:'esi-5'};
    let patSection = '';
    if (patients.length === 0) {
        patSection = `<div class="stats-no-data" style="padding:16px 0;font-size:13px">No active patients assigned.</div>`;
    } else {
        const rows = patients.map(p => {
            const esi = p.acuity ? Math.round(parseFloat(p.acuity)) : null;
            const dot = esi ? `<span class="esi-dot ${esiColors[esi] || ''}"></span>` : '';
            return `<tr>
                <td>${p.patient_id}</td>
                <td>${p.chiefcomplaint || '—'}</td>
                <td>${dot}${esi ? `ESI ${esi}` : '—'}</td>
                <td>${p.arrival_time ? p.arrival_time.replace('T', ' ') : '—'}</td>
            </tr>`;
        }).join('');
        patSection = `
            <table class="staff-patient-table">
                <thead><tr><th>Patient ID</th><th>Chief Complaint</th><th>Acuity</th><th>Arrived</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    }

    // Beds + ward distribution
    let bedSection = '';
    if (beds.length === 0) {
        bedSection = `<div class="stats-no-data" style="padding:16px 0;font-size:13px">No beds assigned.</div>`;
    } else {
        const bedRows = beds.map(b => {
            const typeClass = b.type ? `bed-type-${b.type.toLowerCase()}` : '';
            return `<div class="staff-bed-row">
                <span class="bed-number-badge">${b.bed_number || `#${b.bed_id}`}</span>
                <span class="bed-type-tag ${typeClass}">${b.type || '—'}</span>
                <span style="font-size:12px;color:#555">Patient ${b.patient_id}</span>
                <span class="bed-ward-label">${b.ward}</span>
            </div>`;
        }).join('');

        const wardPills = Object.entries(ward_distribution).map(([ward, count]) =>
            `<span class="ward-dist-pill">${ward}: ${count}</span>`
        ).join('');

        bedSection = `
            <div class="staff-beds-block">${bedRows}</div>
            <div style="margin-top:10px">
                <div class="staff-profile-section-title" style="margin-bottom:6px">Ward Distribution</div>
                <div class="staff-ward-dist">${wardPills}</div>
            </div>`;
    }

    return `
        <div class="staff-profile">
            ${header}
            <div class="staff-profile-body">
                <div>
                    <div class="staff-profile-section-title">Assigned Patients (${patients.length})</div>
                    ${patSection}
                </div>
                <div>
                    <div class="staff-profile-section-title">Patient Beds</div>
                    ${bedSection}
                </div>
            </div>
        </div>`;
}

let _staffSelectorsWired = false;

// Populate selectors for the Nurses and Doctors panes.
// Re-populates options on every call (data may have changed) but only
// wires change-event listeners once to avoid duplicate firings.
async function _initStaffSelectors() {
    try {
        await Promise.all([
            _populateStaffSelect('nurse-staff-select',  'nurse'),
            _populateStaffSelect('doctor-staff-select', 'doctor'),
        ]);
    } catch { /* _populateStaffSelect handles its own errors */ }

    if (!_staffSelectorsWired) {
        document.getElementById('nurse-staff-select')?.addEventListener('change',
            () => loadStaffProfile('nurse-staff-select',  'nurse-staff-profile',  'nurse'));
        document.getElementById('doctor-staff-select')?.addEventListener('change',
            () => loadStaffProfile('doctor-staff-select', 'doctor-staff-profile', 'doctor'));
        _staffSelectorsWired = true;
    }
}

// Refresh statistics automatically whenever any data changes and this section is open
onDataChange(function() {
    if (document.getElementById('statistics')?.classList.contains('active')) {
        loadStatistics();
    }
});
