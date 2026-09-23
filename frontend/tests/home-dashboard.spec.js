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

        await expect(page.locator('.hd-quick-actions .feature-card')).toHaveCount(4);
        await expect(page.locator('.feature-card-primary h3')).toHaveText('New ISBAR Entry');

        // Alerts panel settles out of its loading state one way or another.
        await expect(page.locator('#hd-alerts-body .loading')).toHaveCount(0, { timeout: 10000 });
    });

    test('quick action navigates to the right section', async ({ page }) => {
        await login(page);
        await page.click('.hd-quick-actions .feature-card:has-text("Open Live ER")');
        await expect(page.locator('#beds-display.section.active')).toBeVisible();
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
