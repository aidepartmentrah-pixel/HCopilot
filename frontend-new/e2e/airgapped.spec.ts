import { expect, test } from '@playwright/test'

test.describe('Air-gapped build (§29, NF8.5)', () => {
  test('the app shell and fonts load with zero external network requests', async ({ page, context }) => {
    // Block anything that isn't this app's own origin or the local API
    // proxy target — a real assertion the built app never reaches out
    // to the internet, not just "no CDN links in source" (§29's own
    // instruction to verify this for real).
    const externalRequests: string[] = []
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url())
      const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
      if (!isLocal) {
        externalRequests.push(url.toString())
        route.abort()
        return
      }
      route.continue()
    })

    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'HCopilot' })).toBeVisible()

    // Also visit a font-heavy page (Arabic names render here) to
    // exercise the actual @font-face requests, not just the app shell.
    await page.goto('/isbar')
    await page.waitForTimeout(1000)

    // Statistics (V2.5) lazy-loads recharts — the exact kind of new
    // runtime dependency this test exists to catch if it ever silently
    // pulled a CDN font/script instead of bundling locally via npm/Vite.
    await page.goto('/statistics')
    await page.getByText('Active Patients').waitFor({ timeout: 10000 })
    await page.waitForTimeout(1000)

    expect(externalRequests).toEqual([])
  })

  test('@font-face declarations resolve to this origin, never fonts.googleapis.com/fonts.gstatic.com', async ({ page }) => {
    // Reads the actual computed @font-face rules from the loaded
    // stylesheets instead of sniffing live network requests — the first
    // attempt at this test sniffed `page.on('request')` for font URLs,
    // but Chromium's disk cache made that genuinely flaky (0 requests
    // observed some runs, even with Network.setCacheDisabled) depending
    // on what earlier tests in the same run had already fetched. This
    // version is deterministic: it checks what the browser actually
    // resolved each @font-face `src` to, regardless of whether a fresh
    // network request happened to fire during this specific test.
    await page.goto('/isbar')
    await page.waitForTimeout(500)

    const fontSources = await page.evaluate(() => {
      const urls: string[] = []
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList
        try {
          rules = sheet.cssRules
        } catch {
          continue // cross-origin stylesheet — shouldn't exist in this app, but skip defensively
        }
        for (const rule of Array.from(rules)) {
          if (rule instanceof CSSFontFaceRule) {
            const match = rule.style.getPropertyValue('src').match(/url\(["']?([^"')]+)["']?\)/g)
            if (match) urls.push(...match.map((m) => m.replace(/^url\(["']?/, '').replace(/["']?\)$/, '')))
          }
        }
      }
      return urls
    })

    expect(fontSources.length).toBeGreaterThan(0)
    for (const src of fontSources) {
      const resolved = new URL(src, page.url())
      expect(resolved.hostname).toMatch(/^(localhost|127\.0\.0\.1)$/)
      expect(resolved.href).not.toMatch(/fonts\.(googleapis|gstatic)\.com/)
    }
  })
})
