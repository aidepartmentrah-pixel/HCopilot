import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

// Signs in through the real login form as brand-new restricted accounts (created here, deleted afterwards).
test.use({ storageState: { cookies: [], origins: [] } })

const API = 'http://localhost:8090'
const PASSWORD = 'Access-Test-123'

async function createUser(request: APIRequestContext, username: string, sections: string, settingsTabs = '') {
  const res = await request.post(`${API}/api/auth/users`, {
    data: { username, password: PASSWORD, name: 'Access test', role: 'user', sections, settings_tabs: settingsTabs, statistics_tabs: '' },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()).user_id as number
}

async function signIn(page: Page, username: string) {
  await page.goto('/')
  await page.getByLabel(/username/i).fill(username)
  await page.getByLabel(/password/i).fill(PASSWORD)
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Primary' }).getByRole('link')

test.describe('per-user page access (new UI)', () => {
  test('a limited user sees only the granted pages and is blocked from the others by URL too', async ({ page, request }) => {
    const username = `zz_access_${Date.now()}`
    const id = await createUser(request, username, 'patients,patient-history')
    try {
      await signIn(page, username)
      await expect(nav(page)).toHaveText(['Home', 'ER ISBAR Entry', 'History'])

      await page.goto('/live-er')
      await expect(page.getByText("You don't have access to this page")).toBeVisible()
      await page.goto('/settings')
      await expect(page.getByText("You don't have access to this page")).toBeVisible()
      await page.goto('/history')
      await expect(page.getByRole('heading', { name: 'History' }).first()).toBeVisible()
    } finally {
      await request.delete(`${API}/api/auth/users/${id}`)
    }
  })

  test('a Settings user only gets the Settings areas granted to them', async ({ page, request }) => {
    const username = `zz_access_${Date.now()}`
    const id = await createUser(request, username, 'settings', 'beds')
    try {
      await signIn(page, username)
      await expect(nav(page)).toHaveText(['Home', 'Settings'])
      await page.goto('/settings')
      const sidebar = page.getByRole('navigation', { name: 'Settings' })
      await expect(sidebar.getByRole('button', { name: 'Beds' })).toBeVisible()
      await expect(sidebar.getByRole('button')).toHaveCount(1) // no Doctors, Integrations, AI & Models, Accounts…
    } finally {
      await request.delete(`${API}/api/auth/users/${id}`)
    }
  })

  test('an administrator still sees everything', async ({ page, request }) => {
    const res = await request.post(`${API}/api/auth/login`, { data: { username: 'admin', password: 'admin' } })
    expect(res.ok()).toBeTruthy()
    await page.goto('/')
    await page.getByLabel(/username/i).fill('admin')
    await page.getByLabel(/password/i).fill('admin')
    await page.getByRole('button', { name: /sign in|log in/i }).click()
    await expect(nav(page)).toHaveText(['Home', 'ER ISBAR Entry', 'Live ER', 'History', 'Statistics', 'Predictions', 'Settings'])
    await page.goto('/settings')
    await expect(page.getByRole('navigation', { name: 'Settings' }).getByRole('button', { name: 'Accounts & Permissions' })).toBeVisible()
  })
})
