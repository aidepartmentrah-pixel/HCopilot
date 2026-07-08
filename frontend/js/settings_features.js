/**
 * settings_features.js — Optional feature toggles for HCopilot.
 *
 * Controls which optional UI sections are visible, persisted in localStorage
 * so the choice survives page reloads without a server round-trip.
 *
 * Managed features:
 *   intake — Patient Intake Simulator panel inside the Simulation section.
 *   flow   — Flow Prediction section in the navigation (on by default).
 *
 * Responsibilities:
 *   getFeature(key)        — read the current toggle state (true = enabled).
 *   setFeature(key, value) — persist the new state and call applyFeatures().
 *   applyFeatures()        — show/hide DOM elements based on stored state;
 *                            called on page load and after every toggle change.
 */

var FEAT_KEYS = {
    intake: 'hcopilot_feat_intake',
    flow:   'hcopilot_feat_flow',
};

// ── State helpers ─────────────────────────────────────────────────────────────

function getFeature(key) {
    const v = localStorage.getItem(FEAT_KEYS[key]);
    if (v !== null) return v === 'true';
    // Defaults: flow is on, intake is off
    return key === 'flow';
}

function setFeature(key, value) {
    localStorage.setItem(FEAT_KEYS[key], String(value));
    applyFeatures();
    // Keep the settings card checkboxes in sync
    loadFeaturesSettings();
}

// ── Apply to the live UI ──────────────────────────────────────────────────────

function applyFeatures() {

    // ── Patient Intake panel (inside Simulation) ──────────────────────────────
    const intakeOn = getFeature('intake');
    if (typeof toggleSimIntake === 'function') {
        toggleSimIntake(intakeOn);
    }

    // ── Flow Prediction section ───────────────────────────────────────────────
    const flowOn = getFeature('flow');
    document.querySelectorAll('[data-section="flow-prediction"]').forEach(btn => {
        // Combine with auth access: show only if feature is on AND user has access
        const authAllows = typeof canAccess === 'function' ? canAccess('flow-prediction') : true;
        btn.style.display = (flowOn && authAllows) ? '' : 'none';
    });

    // If the user is currently viewing Flow Prediction and it was just disabled,
    // navigate them to Home.
    const flowSec = document.getElementById('flow-prediction');
    if (!flowOn && flowSec && flowSec.classList.contains('active')) {
        if (typeof showSection === 'function') showSection('home');
    }
}

// ── Render the settings card toggles ─────────────────────────────────────────

function loadFeaturesSettings() {
    const flowToggle   = document.getElementById('feat-toggle-flow');
    const intakeToggle = document.getElementById('feat-toggle-intake');
    if (flowToggle)   flowToggle.checked   = getFeature('flow');
    if (intakeToggle) intakeToggle.checked = getFeature('intake');
}

// Apply on full DOM ready (script sits before nav-drawer HTML in the body)
document.addEventListener('DOMContentLoaded', applyFeatures);
