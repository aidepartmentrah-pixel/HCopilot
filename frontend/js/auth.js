// Session-based access control for HCopilot.
//
// Manages the in-memory user session (stored in localStorage), login/logout
// flows, and three tiers of frontend access control:
//   1. sections       — which top-level nav pages are visible
//   2. settings_tabs  — which sub-tabs within the Settings section are shown
//   3. statistics_tabs — which sub-tabs within the Statistics section are shown
//                        (patients / nurses / doctors)
//
// Key globals exported for use by other scripts:
//   HCOPILOT_SECTIONS          — ordered list of all navigation sections
//   HCOPILOT_SETTINGS_TABS     — ordered list of all settings sub-tabs (with groups)
//   HCOPILOT_STATISTICS_TABS   — ordered list of the 3 statistics sub-tabs
//   userSections()             — returns allowed section IDs for the current user
//   userSettingsTabs()         — returns allowed settings tab IDs
//   userStatisticsTabs()       — returns allowed statistics tab IDs
//   canAccess(id)              — true if section is accessible
//   canAccessSettingsTab(id)   — true if settings tab is accessible
//   canAccessStatisticsTab(id) — true if statistics tab is accessible
//
// Passwords are hashed server-side (SHA-256); the client only stores
// the returned user object (no password, no token).

// var so these are accessible from other script files (const is not globally scoped)
var AUTH_API    = 'http://localhost:8090/api/auth';
var SESSION_KEY = 'hcopilot_session';

// Ordered list of settings tabs — used for access control and the settings-tab sub-picker.
var HCOPILOT_SETTINGS_TABS = [
    { id: 'beds',           label: '🛏️ Beds',           group: 'Resources'  },
    { id: 'doctors',        label: '👨‍⚕️ Doctors',        group: 'Resources'  },
    { id: 'nurses',         label: '👩‍⚕️ Nurses',         group: 'Resources'  },
    { id: 'wards',          label: '🏥 Wards',           group: 'Resources'  },
    { id: 'daily-patients', label: '📋 Daily Patients',  group: 'Patients'   },
    { id: 'log-patients',   label: '📜 Log Patients',    group: 'Patients'   },
    { id: 'shifts',         label: '⏱️ Shifts',          group: 'Scheduling' },
    { id: 'groups',         label: '👥 Groups',          group: 'Scheduling' },
    { id: 'datasets',       label: '📂 Datasets',        group: 'Data'       },
    { id: 'relations',      label: '🔗 Relations',       group: 'Data'       },
    { id: 'models',         label: '🤖 Models',          group: 'System'     },
    { id: 'features',       label: '⚙️ Features',        group: 'System'     },
    { id: 'reset',          label: '⚠️ Reset',           group: null         },
];

// Sub-tabs inside the Statistics section — used for access control and the statistics sub-picker.
var HCOPILOT_STATISTICS_TABS = [
    { id: 'patients', label: '🏥 Patients' },
    { id: 'nurses',   label: '👩‍⚕️ Nurses'  },
    { id: 'doctors',  label: '🩺 Doctors'  },
];

// Ordered list used for nav filtering and the section-picker in user management.
var HCOPILOT_SECTIONS = [
    { id: 'home',            label: '🏠 Home' },
    { id: 'flow-prediction', label: '📈 Flow Prediction' },
    { id: 'beds-display',    label: '🛏️ Beds' },
    { id: 'patients',        label: '🧑‍⚕️ Patients' },
    { id: 'scheduling',      label: '📅 Scheduling' },
    { id: 'simulation',      label: '🧪 Simulation' },
    { id: 'unurgent',        label: '🟢 Unurgent' },
    { id: 'statistics',      label: '📊 Statistics' },
    { id: 'settings',        label: '⚙️ Settings' },
];

// ── Session store ─────────────────────────────────────────────────────────────

let _user = null;

function currentUser()  { return _user; }
function isAdmin()      { return _user && _user.role === 'admin'; }

function userSections() {
    if (!_user) return [];
    if (_user.role === 'admin') return HCOPILOT_SECTIONS.map(s => s.id);
    return (_user.sections || '').split(',').map(s => s.trim()).filter(Boolean);
}

function canAccess(sectionId) {
    return userSections().includes(sectionId);
}

// Returns the settings tabs this user may open.
// Admins get everything (including accounts). Regular users get whatever is in settings_tabs,
// but only if they also have access to the settings section.
function userSettingsTabs() {
    if (!_user) return [];
    if (_user.role === 'admin') return HCOPILOT_SETTINGS_TABS.map(t => t.id).concat(['accounts']);
    if (!userSections().includes('settings')) return [];
    return (_user.settings_tabs || '').split(',').map(s => s.trim()).filter(Boolean);
}

function canAccessSettingsTab(tab) {
    return userSettingsTabs().includes(tab);
}

// Returns the statistics sub-tabs this user may open (patients / nurses / doctors).
// Defaults to all tabs when statistics_tabs is empty so existing accounts keep working.
function userStatisticsTabs() {
    if (!_user) return [];
    if (_user.role === 'admin') return HCOPILOT_STATISTICS_TABS.map(t => t.id);
    if (!userSections().includes('statistics')) return [];
    const tabs = (_user.statistics_tabs || '').split(',').map(s => s.trim()).filter(Boolean);
    return tabs.length > 0 ? tabs : HCOPILOT_STATISTICS_TABS.map(t => t.id);
}

function canAccessStatisticsTab(tab) {
    return userStatisticsTabs().includes(tab);
}

function _save(user)  { _user = user; localStorage.setItem(SESSION_KEY, JSON.stringify(user)); }
function _clear()     { _user = null; localStorage.removeItem(SESSION_KEY); }

// ── Login ─────────────────────────────────────────────────────────────────────

async function authLogin() {
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    const errEl    = document.getElementById('auth-error');
    const btn      = document.getElementById('auth-login-btn');

    if (!username || !password) {
        _showAuthError('Please enter your username and password.');
        return;
    }

    btn.disabled    = true;
    btn.textContent = 'Signing in…';
    errEl.style.display = 'none';

    try {
        const res  = await fetch(`${AUTH_API}/login`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Login failed');

        _save(data.user);
        _applyAccess();
        document.getElementById('auth-overlay').style.display = 'none';
        _updateBadge(data.user);
        _redirectToFirstAccessible();

    } catch (err) {
        _showAuthError(err.message);
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Sign In';
    }
}

function authLogout() {
    _clear();
    location.reload();
}

function _showAuthError(msg) {
    const el = document.getElementById('auth-error');
    el.textContent    = msg;
    el.style.display  = '';
}

// ── Access enforcement ────────────────────────────────────────────────────────

function _applyAccess() {
    if (!_user) return;
    const allowed = userSections();

    // Filter standalone nav buttons and dropdown items
    document.querySelectorAll('[data-section]').forEach(btn => {
        btn.style.display = allowed.includes(btn.dataset.section) ? '' : 'none';
    });

    // Hide group buttons whose every section is inaccessible
    if (typeof NAV_GROUPS !== 'undefined') {
        Object.entries(NAV_GROUPS).forEach(([groupId, cfg]) => {
            const navBtn    = document.getElementById(groupId + '-btn');
            const drawerGrp = document.getElementById(cfg.drawer);
            const anyOk     = cfg.sections.some(s => allowed.includes(s));
            if (navBtn)    navBtn.style.display    = anyOk ? '' : 'none';
            if (drawerGrp) drawerGrp.style.display = anyOk ? '' : 'none';
        });
    }

    // Show/hide the Accounts settings tab (admin only)
    const accTab = document.querySelector('[data-tab="accounts"]');
    if (accTab) accTab.style.display = _user.role === 'admin' ? '' : 'none';

    // Filter individual settings tabs
    const allowedTabs = userSettingsTabs();
    document.querySelectorAll('.settings-tab[data-tab]').forEach(btn => {
        const tab = btn.dataset.tab;
        if (tab === 'accounts') return; // already handled above
        btn.style.display = allowedTabs.includes(tab) ? '' : 'none';
    });

    // Hide settings tab groups whose every child tab is inaccessible
    if (typeof STAB_GROUPS !== 'undefined') {
        Object.entries(STAB_GROUPS).forEach(([groupId, tabs]) => {
            const g = document.getElementById(groupId);
            if (!g) return;
            const anyOk = tabs.some(t => allowedTabs.includes(t));
            g.style.display = anyOk ? '' : 'none';
        });
    }
}

// Navigate to the first section the user can access, skipping home if not permitted.
function _redirectToFirstAccessible() {
    const allowed = userSections();
    if (allowed.length === 0) return;

    // Find which section is currently shown
    const active   = document.querySelector('.section.active');
    const activeId = active ? active.id : 'home';

    // Only redirect if the current section isn't accessible
    if (allowed.includes(activeId)) return;

    // Pick the first section from the ordered list the user has access to
    const first = HCOPILOT_SECTIONS.find(s => allowed.includes(s.id));
    if (first && typeof showSection === 'function') {
        showSection(first.id);
    }
}

function _updateBadge(user) {
    const wrap    = document.getElementById('auth-user-badge-wrap');
    const initial = document.getElementById('auth-user-initial');
    const display = document.getElementById('auth-user-badge');
    const role    = document.getElementById('auth-user-role-badge');
    const avatar  = document.querySelector('.auth-user-avatar');

    if (!wrap) return;
    wrap.style.display = '';
    if (display) display.textContent = user.name || user.username;
    if (role)    role.textContent    = user.role;
    if (initial) initial.textContent = (user.name || user.username).charAt(0).toUpperCase();
    if (avatar) {
        avatar.classList.toggle('role-admin', user.role === 'admin');
        avatar.classList.toggle('role-user',  user.role !== 'admin');
    }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

function authBoot() {
    try {
        const stored = localStorage.getItem(SESSION_KEY);
        if (stored) _user = JSON.parse(stored);
    } catch (_) { _user = null; }

    if (_user) {
        _applyAccess();
        _updateBadge(_user);
        document.getElementById('auth-overlay').style.display = 'none';
        _redirectToFirstAccessible();
    } else {
        document.getElementById('auth-overlay').style.display = 'flex';
    }
}

// The auth overlay HTML is placed after the script tags in the body,
// so we must wait for full DOM parsing before accessing it.
document.addEventListener('DOMContentLoaded', function () {
    authBoot();

    const pw = document.getElementById('auth-password');
    if (pw) pw.addEventListener('keydown', e => { if (e.key === 'Enter') authLogin(); });
    const un = document.getElementById('auth-username');
    if (un) un.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            const pw2 = document.getElementById('auth-password');
            if (pw2 && !pw2.value) pw2.focus(); else authLogin();
        }
    });
});
