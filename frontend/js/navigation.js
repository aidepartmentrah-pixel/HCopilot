/**
 * navigation.js — Controls section navigation, nav dropdown groups, the mobile
 * nav drawer, and settings tab groups for HCopilot.
 *
 * Serves: the top navigation bar and all <section> elements in index.html.
 * Every named section in the app is shown or hidden exclusively through
 * showSection() so that only one section is ever visible at a time.
 *
 * Responsibilities:
 *   - showSection(sectionId)    Hide all sections, show the requested one, trigger
 *                               lazy data loaders, and update active nav-link styling.
 *   - toggleNavGroup()          Open/close grouped desktop dropdown menus (Care, Ops).
 *   - toggleNavMenu()           Open/close the mobile slide-in drawer.
 *   - showSettingsTab(tab)      Switch the active settings card and expand the right
 *                               tab group accordion, triggering lazy loaders.
 *   - goToSettingsTab(tab)      Navigate to Settings section and open a specific tab
 *                               directly (used by quick-link buttons elsewhere).
 *
 * Key globals:
 *   NAV_GROUPS   — maps desktop nav-group IDs to their child section IDs + mobile drawer ID
 *   STAB_GROUPS  — maps settings tab-group IDs to their child tab IDs
 */

// Controls section navigation, dropdown groups, and settings tab groups.

// ── Group definitions ─────────────────────────────────────────────────────────

// Each nav group: which sections it contains, and the matching mobile drawer id.
// The `drawer` key is the HTML element id of the corresponding accordion group
// in the mobile slide-in drawer so both desktop and mobile state can be kept
// in sync by iterating a single data structure.
var NAV_GROUPS = {
    'navg-care': { sections: ['beds-display', 'unurgent'],   drawer: 'dg-care' },
    'navg-ops':  { sections: ['scheduling',   'simulation'], drawer: 'dg-ops'  },
};

// Each settings group maps a tab-group accordion element id to the array of
// tab IDs it contains.  Used by showSettingsTab() to expand the correct
// accordion and collapse all others when the user switches tabs.
var STAB_GROUPS = {
    'stabg-resources': ['beds', 'doctors', 'nurses', 'wards'],
    'stabg-patients':  ['daily-patients', 'log-patients'],
    'stabg-sched':     ['shifts', 'groups'],
    'stabg-data':      ['datasets', 'relations'],
    'stabg-system':    ['models', 'features'],
};

// ── Section navigation ────────────────────────────────────────────────────────

/**
 * Switch the visible section of the single-page app.
 *
 * Steps performed:
 *  1. Enforce per-user access control (redirects to 'home' if blocked).
 *  2. Remove 'active' from all sections and nav buttons.
 *  3. Add 'active' to the requested section and its nav button(s).
 *  4. Update the desktop group button and mobile drawer group button highlights.
 *  5. Close any open nav menus/dropdowns.
 *  6. Trigger the appropriate lazy data-loader for the section being shown.
 *
 * Lazy loading means each section fetches its data only when first visited,
 * rather than loading everything upfront on page load.  This keeps initial
 * load time fast for users who only visit a subset of sections.
 *
 * @param {string} sectionId - HTML element ID of the target section (e.g. 'beds-display').
 */
function showSection(sectionId) {
    // Enforce per-user section access; canAccess() is defined in auth.js
    if (typeof canAccess === 'function' && sectionId !== 'home' && !canAccess(sectionId)) {
        showSection('home');
        return;
    }

    // Deactivate every section and nav button before activating the target
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('[data-section]').forEach(btn => btn.classList.remove('active'));

    const section = document.getElementById(sectionId);
    if (section) section.classList.add('active');

    // Multiple nav buttons can link to the same section (e.g. desktop + mobile),
    // so querySelectorAll is used rather than getElementById
    document.querySelectorAll(`[data-section="${sectionId}"]`).forEach(btn => btn.classList.add('active'));

    // Highlight the group button (desktop) and drawer group button (mobile)
    // that owns this section; clear the others.
    Object.entries(NAV_GROUPS).forEach(([groupId, cfg]) => {
        const navBtn     = document.getElementById(groupId + '-btn');
        const drawerGrp  = document.getElementById(cfg.drawer);
        // The drawer group button is the first child button of the drawer group element
        const drawerBtn  = drawerGrp ? drawerGrp.querySelector('.nav-drawer-group-btn') : null;
        const inGroup    = cfg.sections.includes(sectionId);
        // classList.toggle(class, force) adds the class when force is true, removes when false
        if (navBtn)    navBtn.classList.toggle('active', inGroup);
        if (drawerBtn) drawerBtn.classList.toggle('active', inGroup);
    });

    // Close any open menus so they don't obscure the new section
    closeNavMenu();
    closeNavDropdowns();

    // ── Lazy data loaders — each section loads its own data on first visit ──
    if (sectionId === 'flow-prediction') { loadFlowStats(); loadFlowPrediction(30); }
    if (sectionId === 'beds-display')  { loadBeds(); }
    if (sectionId === 'patients')      { initPatientForm(); loadPatients(); }
    if (sectionId === 'settings') {
        _loadCoreSettings();
        // Show the first settings tab accessible to the current user
        const firstTab = (typeof canAccessSettingsTab === 'function' && typeof HCOPILOT_SETTINGS_TABS !== 'undefined')
            ? HCOPILOT_SETTINGS_TABS.find(t => canAccessSettingsTab(t.id))
            : null;
        showSettingsTab(firstTab ? firstTab.id : 'beds');
    }
    if (sectionId === 'scheduling')    { loadSchedulingSection(); }
    if (sectionId === 'simulation')    { initSimulation(); }
    if (sectionId === 'unurgent')      { initUnurgent(); }
    if (sectionId === 'statistics')    { loadStatistics(); }
}

// ── Nav dropdown groups ───────────────────────────────────────────────────────

/**
 * Toggle the desktop nav dropdown for a button group (e.g. Care, Ops).
 * Closes all other dropdowns first so only one is open at a time.
 * The dropdown is positioned directly below the group button using getBoundingClientRect
 * so it stays aligned even when the nav bar is scrolled horizontally.
 *
 * stopPropagation() prevents the document-level click handler (which closes all
 * dropdowns) from firing on the same event and immediately closing the one we
 * just opened.
 *
 * @param {string} groupId - ID prefix of the nav group (e.g. 'navg-care').
 * @param {Event}  event   - Click event; stopPropagation() prevents the document
 *                           click handler from immediately closing the dropdown.
 */
function toggleNavGroup(groupId, event) {
    event.stopPropagation();
    const dropdown = document.getElementById(groupId + '-dd');
    const btn      = document.getElementById(groupId + '-btn');
    if (!dropdown || !btn) return;

    // Capture open state before closeNavDropdowns() resets it
    const wasOpen = dropdown.classList.contains('open');
    closeNavDropdowns();

    if (!wasOpen) {
        // Position the dropdown directly below the button using its viewport rect
        const rect = btn.getBoundingClientRect();
        dropdown.style.top  = (rect.bottom + 6) + 'px';
        dropdown.style.left = rect.left + 'px';
        dropdown.classList.add('open');
        btn.classList.add('dropdown-open');
    }
}

/**
 * Close all open desktop nav dropdowns and remove their 'dropdown-open' styling.
 * Called by toggleNavGroup (before opening a new one), by the document click
 * listener, and by the Escape key handler.
 */
function closeNavDropdowns() {
    document.querySelectorAll('.nav-dropdown').forEach(d => d.classList.remove('open'));
    document.querySelectorAll('.nav-group-btn').forEach(b => b.classList.remove('dropdown-open'));
}

// Close dropdowns when the user clicks anywhere outside them, or presses Escape.
// These listeners are attached once at load time and remain active for the lifetime
// of the page — no cleanup needed for a single-page app.
document.addEventListener('click', closeNavDropdowns);
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeNavMenu(); closeNavDropdowns(); }
});

// ── Mobile nav drawer ─────────────────────────────────────────────────────────

/**
 * Toggle the mobile slide-in navigation drawer open or closed.
 * When opening, body scroll is locked and the overlay is shown so the user
 * cannot interact with content behind the drawer.
 * The group containing the currently active section is auto-expanded
 * so the user immediately sees which group they are in.
 */
function toggleNavMenu() {
    const drawer  = document.getElementById('nav-drawer');
    const overlay = document.getElementById('nav-overlay');
    if (!drawer || !overlay) return;

    const isOpen = drawer.classList.contains('open');
    if (isOpen) {
        closeNavMenu();
    } else {
        drawer.classList.add('open');
        overlay.classList.add('open');
        // Prevent the page from scrolling behind the drawer while it is open
        document.body.style.overflow = 'hidden';

        // Auto-expand the group that contains the active section
        const active = document.querySelector('.section.active');
        if (active) {
            Object.entries(NAV_GROUPS).forEach(([, cfg]) => {
                const dg = document.getElementById(cfg.drawer);
                // Add 'open' only to the group that owns the current section
                if (dg && cfg.sections.includes(active.id)) dg.classList.add('open');
            });
        }
    }
}

/**
 * Close the mobile nav drawer and restore normal page scrolling.
 * Called by the overlay click, the Escape key handler, and showSection().
 */
function closeNavMenu() {
    const drawer  = document.getElementById('nav-drawer');
    const overlay = document.getElementById('nav-overlay');
    if (!drawer || !overlay) return;
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    // Restore normal scroll behaviour after the drawer closes
    document.body.style.overflow = '';
}

/**
 * Toggle one mobile drawer group accordion open or closed.
 * Closes all sibling groups first so only one is open at a time,
 * providing a cleaner UX on small screens where space is limited.
 *
 * @param {string} groupId - ID of the .nav-drawer-group element to toggle.
 */
function toggleDrawerGroup(groupId) {
    const g = document.getElementById(groupId);
    if (!g) return;
    // Close all other groups before toggling this one
    document.querySelectorAll('.nav-drawer-group').forEach(el => {
        if (el !== g) el.classList.remove('open');
    });
    g.classList.toggle('open');
}

// ── Settings helpers ──────────────────────────────────────────────────────────

/**
 * Trigger initial data loads for the four "core" settings tabs that are always
 * visible when Settings is opened: Beds, Doctors, Nurses, and Wards.
 * Other tabs (Shifts, Groups, Models, etc.) are loaded lazily by showSettingsTab()
 * when the user first navigates to them, to avoid unnecessary network requests.
 */
function _loadCoreSettings() {
    loadSettingsBeds();
    loadDoctorsSettings();
    loadNursesSettings();
    loadWardsSettings();
    loadDailyPatientsSettings();
}

/**
 * Activate a settings tab card and deactivate all others.
 *
 * Steps:
 *  1. Redirect to the first accessible tab if the requested one is blocked by auth.
 *  2. Show only the card whose data-settings-tab matches the requested tab.
 *  3. Toggle 'active' on individual tab buttons.
 *  4. Expand the accordion group containing this tab; collapse all others.
 *  5. Run the lazy data-loader for tabs that need it (models, relations, etc.).
 *
 * The `accounts` tab is exempt from the access check so that the system admin
 * can always reach it regardless of role restrictions.
 *
 * @param {string} tab - ID of the settings tab to activate (e.g. 'beds', 'doctors').
 */
function showSettingsTab(tab) {
    // Redirect to first accessible tab if this one is blocked
    if (tab !== 'accounts' && typeof canAccessSettingsTab === 'function' && !canAccessSettingsTab(tab)) {
        const first = typeof HCOPILOT_SETTINGS_TABS !== 'undefined'
            ? HCOPILOT_SETTINGS_TABS.find(t => canAccessSettingsTab(t.id))
            : null;
        if (first) { showSettingsTab(first.id); return; }
        // No accessible tab at all — hide every card and deactivate all tab buttons
        document.querySelectorAll('[data-settings-tab]').forEach(c => c.style.display = 'none');
        document.querySelectorAll('.settings-tab').forEach(b => b.classList.remove('active'));
        return;
    }

    // Show only the card for this tab; empty string restores the element's
    // default display value (set in CSS) rather than forcing 'block'
    document.querySelectorAll('[data-settings-tab]').forEach(card => {
        card.style.display = card.dataset.settingsTab === tab ? '' : 'none';
    });

    // Toggle active state on each tab button individually
    document.querySelectorAll('.settings-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Handle group expansion: open the group containing this tab, close others
    let inAGroup = false;
    Object.entries(STAB_GROUPS).forEach(([groupId, tabs]) => {
        const g   = document.getElementById(groupId);
        const btn = g ? g.querySelector('.stab-group-btn') : null;
        if (tabs.includes(tab)) {
            // This group owns the active tab — expand it and mark it as having an active child
            if (g)   g.classList.add('open');
            if (btn) btn.classList.add('has-active');
            inAGroup = true;
        } else {
            // All other groups collapse
            if (g)   g.classList.remove('open');
            if (btn) btn.classList.remove('has-active');
        }
    });

    // ── Lazy loaders — only triggered on first visit to each tab ──
    if (tab === 'models')       { loadModelFiles(); }
    if (tab === 'relations')    { loadRelationsSettings(); }
    if (tab === 'log-patients') { loadLogPatientsSettings(); }
    if (tab === 'shifts')       { loadShiftsSettings(); }
    if (tab === 'groups')       { loadGroupsSettings(); }
    if (tab === 'accounts')     { loadAccountsSettings(); }
    if (tab === 'features')     { loadFeaturesSettings(); }
}

/**
 * Toggle a settings tab-group accordion open or closed.
 * All other groups are collapsed first (only one open at a time).
 *
 * wasOpen captures the state before the mass-collapse so we can restore it
 * if the user clicked on the already-open group (the expected toggle behaviour).
 *
 * @param {string} groupId - ID of the settings tab-group element (e.g. 'stabg-resources').
 */
function toggleStabGroup(groupId) {
    const g = document.getElementById(groupId);
    if (!g) return;
    const wasOpen = g.classList.contains('open');

    // Collapse all groups and remove their active-child markers
    Object.keys(STAB_GROUPS).forEach(id => {
        const el  = document.getElementById(id);
        const btn = el ? el.querySelector('.stab-group-btn') : null;
        if (el)  el.classList.remove('open');
        if (btn) btn.classList.remove('has-active');
    });

    // Toggle the clicked one back open if it was previously closed
    if (!wasOpen) g.classList.add('open');
}

/**
 * Navigate directly to the Settings section and open a specific tab.
 * Used by external quick-link buttons (e.g. "Manage Doctors" in another section)
 * that bypass the normal showSection() + showSettingsTab() two-step flow.
 *
 * This function manually replicates the section-switch logic from showSection()
 * rather than calling it, because showSection('settings') would re-run
 * _loadCoreSettings() and showSettingsTab('beds') before we can redirect to the
 * desired tab.
 *
 * @param {string} tab - ID of the settings tab to open (e.g. 'doctors').
 */
function goToSettingsTab(tab) {
    // Deactivate all sections and nav links first
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('[data-section]').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.nav-group-btn').forEach(b => b.classList.remove('active'));

    // Activate the Settings section and its nav button
    document.getElementById('settings').classList.add('active');
    document.querySelectorAll('[data-section="settings"]').forEach(b => b.classList.add('active'));

    // Load core settings data and switch to the requested tab
    _loadCoreSettings();
    showSettingsTab(tab);
}
