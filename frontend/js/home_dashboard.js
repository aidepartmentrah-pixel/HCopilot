/**
 * home_dashboard.js — HCopilot Home page operational dashboard (UI-D1-D5, D7, D9).
 *
 * Serves: the #home section in index.html. Replaces the old four-shortcut
 * launcher's data needs — the launcher cards themselves are still static
 * markup in index.html, this file only drives the new header/welcome/KPI/
 * alerts pieces layered above them.
 *
 * Ideas adapted from the user's Dashboard Edit.md notes (written in React
 * terms) into plain render-function + fetch calls, following the same
 * pattern as beds_display.js / patients.js — no new architecture.
 *
 * Data sources (all endpoints already used elsewhere in the app — no
 * backend changes, per UI-D3's investigation finding):
 *   Active ER Patients   <- GET /api/patients/stats            (.total)
 *   Occupied Beds        <- GET /api/beds/stats                (.occupied / .total_beds)
 *   Waiting Without Bed  <- GET /api/beds/bedless              (.patients.length)
 *   Discharged Today     <- GET /api/data/log-patients/list    (departure_time == today)
 *
 * Alerts (UI-D7, partial — see tracking doc): waiting>5min reuses
 * _erbIsWaitingOverThreshold() from beds_display.js; occupancy reuses the
 * same /api/beds/stats numbers. The ER-roster-freshness alert type from
 * Dashboard Edit.md §9 is not implemented yet (skipped to keep this pass
 * frontend-only and small — see tracking doc).
 *
 * Each KPI card and the alerts panel loads and fails independently
 * (Dashboard Edit.md §19) — one endpoint erroring never blanks the others.
 */

// Occupancy alert thresholds — centralized here rather than hardcoded
// inside a render function (Dashboard Edit.md §9).
var HD_OCC_WARN_PCT = 80;
var HD_OCC_HIGH_PCT = 90;

var HD_REFRESH_MS = 60000; // auto-refresh interval for KPIs + alerts
var _hdRefreshTimer = null;
var _hdClockTimer = null;

var HD_ICONS = {
    users:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8.5" r="3"/><path d="M3.5 19.5c0-3.3 2.5-6 5.5-6s5.5 2.7 5.5 6"/><circle cx="17" cy="9" r="2.3"/><path d="M15.5 13.7c2.3.4 4 2.5 4 5.3"/></svg>',
    bed:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17.5V8a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4.5"/><path d="M3 13.5h18v4"/><path d="M11.5 12.5H16a2.5 2.5 0 0 1 2.5 2.5v.5"/><path d="M3 20v-2.5"/><path d="M21 20v-2.5"/><circle cx="7" cy="9.3" r="1.1"/></svg>',
    clock:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 2"/></svg>',
    check:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V8Z"/><path d="M14 3v4.5A1.5 1.5 0 0 0 15.5 9H20"/><path d="m9 14 2 2 4-4"/></svg>',
    alert:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 21 19H3Z"/><path d="M12 10v4"/><path d="M12 17h.01"/></svg>',
};

// ── Entry point — called by showSection('home') and once on initial boot ──

function loadHomeDashboard() {
    _hdRenderHeader();
    _hdRenderWelcome();
    _hdRenderKpiSkeletons();
    _hdLoadKpis();
    _hdLoadAlerts();

    if (_hdClockTimer) clearInterval(_hdClockTimer);
    _hdClockTimer = setInterval(_hdRenderHeader, 30000);

    if (_hdRefreshTimer) clearInterval(_hdRefreshTimer);
    _hdRefreshTimer = setInterval(function () {
        const home = document.getElementById('home');
        if (!home || !home.classList.contains('active')) {
            clearInterval(_hdRefreshTimer);
            clearInterval(_hdClockTimer);
            return;
        }
        _hdLoadKpis();
        _hdLoadAlerts();
    }, HD_REFRESH_MS);
}

// ── Page header — title + live date/time (UI-D1) ──────────────────────────

function _hdRenderHeader() {
    const dateEl = document.getElementById('hd-date');
    const timeEl = document.getElementById('hd-time');
    if (!dateEl || !timeEl) return;
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
    timeEl.textContent = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// ── Welcome panel (UI-D2) ───────────────────────────────────────────────

function _hdRenderWelcome() {
    const greetEl = document.getElementById('hd-greeting');
    const nameEl  = document.getElementById('hd-username');
    if (!greetEl || !nameEl) return;

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : (hour < 18 ? 'Good afternoon' : 'Good evening');
    greetEl.textContent = greeting.toUpperCase();

    const user = typeof currentUser === 'function' ? currentUser() : null;
    nameEl.textContent = user ? (user.name || user.username) : 'there';
}

// ── KPI row (UI-D3 data plumbing + UI-D4 card row) ─────────────────────

function _hdKpiCardHtml(id, icon, label) {
    return `<div class="hd-kpi-card" id="hd-kpi-${id}">
        <span class="hd-kpi-icon hd-kpi-icon-${id}">${icon}</span>
        <div class="hd-kpi-body">
            <span class="hd-kpi-value" id="hd-kpi-${id}-value">–</span>
            <span class="hd-kpi-label">${label}</span>
            <span class="hd-kpi-meta" id="hd-kpi-${id}-meta"></span>
        </div>
    </div>`;
}

function _hdRenderKpiSkeletons() {
    const row = document.getElementById('hd-kpi-row');
    if (!row) return;
    row.innerHTML =
        _hdKpiCardHtml('active',     HD_ICONS.users, 'Active ER Patients') +
        _hdKpiCardHtml('beds',       HD_ICONS.bed,   'Occupied Beds') +
        _hdKpiCardHtml('waiting',    HD_ICONS.clock, 'Waiting Without Bed') +
        _hdKpiCardHtml('discharged', HD_ICONS.check, 'Discharged Today');
}

// Fills one KPI card from its own promise; a failure only marks that card
// unavailable and never touches the other three (Dashboard Edit.md §19).
function _hdFillKpi(id, fetchFn) {
    const valueEl = document.getElementById(`hd-kpi-${id}-value`);
    const metaEl  = document.getElementById(`hd-kpi-${id}-meta`);
    if (!valueEl) return;
    fetchFn().then(({ value, meta }) => {
        valueEl.textContent = value;
        if (metaEl) metaEl.textContent = meta || '';
    }).catch(() => {
        valueEl.textContent = '–';
        if (metaEl) metaEl.textContent = 'Unavailable';
        document.getElementById(`hd-kpi-${id}`)?.classList.add('hd-kpi-error');
    });
}

function _hdLoadKpis() {
    document.querySelectorAll('.hd-kpi-card').forEach(c => c.classList.remove('hd-kpi-error'));

    _hdFillKpi('active', async () => {
        const res = await fetch('/api/patients/stats');
        const data = await res.json();
        if (!res.ok) throw new Error();
        return { value: data.total ?? 0, meta: '' };
    });

    _hdFillKpi('beds', async () => {
        const res = await fetch('/api/beds/stats');
        const data = await res.json();
        if (!res.ok) throw new Error();
        const total = data.total_beds || 0;
        const pct = total > 0 ? Math.round((data.occupied / total) * 100) : 0;
        return { value: `${data.occupied ?? 0} / ${total}`, meta: `${pct}% occupancy` };
    });

    _hdFillKpi('waiting', async () => {
        const res = await fetch('/api/beds/bedless');
        const data = await res.json();
        if (!res.ok) throw new Error();
        const patients = data.patients || [];
        const over = typeof _erbIsWaitingOverThreshold === 'function'
            ? patients.filter(_erbIsWaitingOverThreshold).length
            : 0;
        return { value: patients.length, meta: over > 0 ? `${over} waiting > 5 min` : '' };
    });

    _hdFillKpi('discharged', async () => {
        const res = await fetch('/api/data/log-patients/list');
        const data = await res.json();
        if (!res.ok) throw new Error();
        const today = new Date().toDateString();
        const count = (data.patients || []).filter(p =>
            p.departure_time && new Date(p.departure_time).toDateString() === today
        ).length;
        return { value: count, meta: '' };
    });
}

// ── Operational Alerts panel (UI-D7, partial) ──────────────────────────

function _hdLoadAlerts() {
    const body = document.getElementById('hd-alerts-body');
    const updated = document.getElementById('hd-alerts-updated');
    if (!body) return;

    Promise.all([
        fetch('/api/beds/bedless').then(r => r.json()),
        fetch('/api/beds/stats').then(r => r.json()),
    ]).then(([bedless, beds]) => {
        const alerts = [];

        const waitingOver = (bedless.patients || []).filter(
            p => typeof _erbIsWaitingOverThreshold === 'function' && _erbIsWaitingOverThreshold(p)
        ).length;
        if (waitingOver > 0) {
            alerts.push({
                level: 'warning',
                text: `${waitingOver} patient${waitingOver > 1 ? 's' : ''} waiting > 5 min without a bed`,
            });
        }

        const total = beds.total_beds || 0;
        if (total > 0) {
            const pct = Math.round((beds.occupied / total) * 100);
            if (pct >= HD_OCC_HIGH_PCT) {
                alerts.push({ level: 'danger', text: `High ER occupancy — ${pct}% of beds are currently occupied` });
            } else if (pct >= HD_OCC_WARN_PCT) {
                alerts.push({ level: 'warning', text: `Elevated ER occupancy — ${pct}% of beds are currently occupied` });
            }
        }

        body.innerHTML = alerts.length
            ? alerts.map(a => `<div class="hd-alert hd-alert-${a.level}">${HD_ICONS.alert}<span>${a.text}</span></div>`).join('')
            : `<div class="hd-alert hd-alert-ok">${HD_ICONS.check}<span>No active alerts — operations look normal</span></div>`;

        if (updated) updated.textContent = 'Last updated ' + new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }).catch(() => {
        body.innerHTML = `<div class="hd-alert hd-alert-error">${HD_ICONS.alert}<span>Operational data unavailable</span></div>`;
    });
}
