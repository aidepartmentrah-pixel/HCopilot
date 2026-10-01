// tests/home-dashboard.spec.js — Legacy Frontend Shell & Dashboard Refresh
// (UI-T7/T8 theme switching, UI-D1-D5/D7 Home dashboard).

const { test, expect } = require('@playwright/test');
const { login } = require('./helpers');

test.describe('Home dashboard', () => {
    test('renders the header, welcome panel, KPI row, and quick actions', async ({ page }) => {
        await login(page);
        await expect(page.locator('.hd-page-title')).toHaveText('HCopilot Overview');
        await expect(page.locator('.hd-username')).not.toHaveText('–');

        // Each KPI card resolves to a real value (or an explicit "Unavailable"
        // failure state) rather than staying stuck on the loading placeholder.
        const values = page.locator('.hd-kpi-value');
        await expect(values).toHaveCount(4);
        for (const v of await values.all()) {
            await expect(v).not.toHaveText('–', { timeout: 10000 });
        }

        await expect(page.locator('.hd-quick-actions .hd-action')).toHaveCount(4);
        await expect(page.locator('.hd-action-primary .hd-action-title')).toHaveText('New ISBAR Entry');

        // Alerts panel settles out of its loading state one way or another.
        await expect(page.locator('#hd-alerts-body .loading')).toHaveCount(0, { timeout: 10000 });
    });

    test('quick action navigates to the right section', async ({ page }) => {
        await login(page);
        await page.click('.hd-quick-actions .hd-action:has-text("Open Live ER")');
        await expect(page.locator('#beds-display.section.active')).toBeVisible();
    });
});

test.describe('Home dashboard layout (Home Dashboard Layout Plan, HD-1..HD-4)', () => {
    test('uses the wide layout on Home only, with one shared grid and no emoji/inner buttons', async ({ page }) => {
        await login(page);
        const edges = await page.evaluate(() => ['.hd-page-title', '.hd-welcome', '.hd-kpi-row', '.hd-quick-actions', '.hd-panels']
            .map(s => Math.round(document.querySelector(s).getBoundingClientRect().left)));
        expect(new Set(edges).size).toBe(1);                       // all blocks share the same left edge
        const homeW = await page.evaluate(() => document.querySelector('.hd-welcome').getBoundingClientRect().width);
        expect(homeW).toBeGreaterThan(1200);                       // was capped at 1200px before HD-1

        await expect(page.locator('.hd-quick-actions button')).toHaveCount(4);   // whole card is the button
        await expect(page.locator('.hd-quick-actions .hd-action svg')).toHaveCount(8); // line icon + arrow each
        const text = await page.locator('.hd-quick-actions').innerText();
        expect(text).not.toMatch(/Start Entry|View Beds|View History →|View Statistics/);

        // Other pages keep the standard 1400px container.
        await page.click('.nav-btn[data-section="patients"]');
        const w = await page.evaluate(() => document.querySelector('.container').getBoundingClientRect().width);
        expect(w).toBeLessThanOrEqual(1400);
    });
});

test.describe('Theme switching (UI-T7/UI-T8)', () => {
    test('selecting a theme applies it live and persists across reload', async ({ page }) => {
        await login(page);
        await page.click('[data-section="settings"]');
        await page.click('[data-tab="appearance"]');

        await page.click('.theme-option[data-theme="teal"]');
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'teal');
        await expect(page.locator('.theme-option[data-theme="teal"]')).toHaveClass(/active/);

        await page.reload();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'teal');

        // Switching back to the default (indigo) removes the attribute
        // entirely rather than setting data-theme="indigo".
        await page.click('[data-section="settings"]');
        await page.click('[data-tab="appearance"]');
        await page.click('.theme-option[data-theme="indigo"]');
        await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
    });
});
