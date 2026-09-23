/**
 * theme.js — Settings > Appearance theme picker for HCopilot (UI-T7/UI-T8).
 *
 * The actual FOUC-avoiding theme application on page load happens in a tiny
 * inline <script> at the top of index.html's <head> (runs before any CSS
 * loads). This file only handles switching themes at runtime from the
 * Settings > Appearance tab and keeping localStorage + the picker UI in sync.
 *
 * Themes are pure CSS: setting [data-theme] on <html> is enough, all colors
 * come from the token overrides in base.css. 'indigo' (the existing purple
 * brand identity) is the default and has no [data-theme] attribute at all.
 */

var HCOPILOT_THEME_KEY = 'hcopilot-theme';
var HCOPILOT_THEMES = ['indigo', 'teal', 'burgundy'];

function currentTheme() {
    var t = document.documentElement.getAttribute('data-theme');
    return HCOPILOT_THEMES.includes(t) ? t : 'indigo';
}

function setTheme(theme) {
    if (!HCOPILOT_THEMES.includes(theme)) return;

    if (theme === 'indigo') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }

    try { localStorage.setItem(HCOPILOT_THEME_KEY, theme); } catch (_) {}

    document.querySelectorAll('.theme-option').forEach(function (el) {
        el.classList.toggle('active', el.dataset.theme === theme);
    });
}

// Reflect the active theme in the picker UI once Settings > Appearance is
// first rendered (the tab's HTML is static in index.html, but which swatch
// shows as "active" needs to match whatever theme is actually applied).
function _syncThemePicker() {
    var active = currentTheme();
    document.querySelectorAll('.theme-option').forEach(function (el) {
        el.classList.toggle('active', el.dataset.theme === active);
    });
}

document.addEventListener('DOMContentLoaded', _syncThemePicker);
