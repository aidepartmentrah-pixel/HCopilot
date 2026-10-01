import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IntegrationsSettings } from './IntegrationsSettings'

const api = vi.hoisted(() => ({
  getConfig: vi.fn(),
  testErRoster: vi.fn(),
  setErRosterEnabled: vi.fn(),
  getMiddleNameCandidates: vi.fn(),
}))
vi.mock('@/api/settings', () => ({ hospitalDirectoryApi: api }))
vi.mock('@/components/feedback/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }))

const baseConfig = {
  configured: true,
  base_url: 'http://x/api',
  api_key_masked: 'xxx_me',
  api_key_error: null,
  timeout_seconds: 10,
  verify_tls: true,
  er_roster_enabled: false,
  last_test_status: null,
  last_test_message: null,
  last_test_at: null,
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <IntegrationsSettings />
    </QueryClientProvider>,
  )
}

describe('IntegrationsSettings — Live ER Roster switch', () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset())
    api.getConfig.mockResolvedValue(baseConfig)
    api.getMiddleNameCandidates.mockResolvedValue({ names: [] })
  })

  it('shows the switch Off by default', async () => {
    renderPage()
    expect(await screen.findByRole('radio', { name: 'Off' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'On' })).toHaveAttribute('aria-checked', 'false')
  })

  it('reports a failed roster test plainly', async () => {
    api.testErRoster.mockResolvedValue({ success: false, status: 'not_found', message: 'Not Found' })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Test ER Roster' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Not Found')
  })

  it('a refused enable keeps the switch off and says so', async () => {
    api.setErRosterEnabled.mockResolvedValue({ success: false, status: 'not_found', message: 'Not Found', er_roster_enabled: false })
    renderPage()
    await userEvent.click(await screen.findByRole('radio', { name: 'On' }))
    await waitFor(() => expect(api.setErRosterEnabled).toHaveBeenCalledWith(true))
    expect(await screen.findByRole('status')).toHaveTextContent('The switch stays off.')
    expect(screen.getByRole('radio', { name: 'Off' })).toHaveAttribute('aria-checked', 'true')
  })

  it('reflects the saved state after a successful enable', async () => {
    api.setErRosterEnabled.mockResolvedValue({ success: true, status: 'ok', message: 'Live ER roster enabled.', er_roster_enabled: true })
    renderPage()
    const on = await screen.findByRole('radio', { name: 'On' })
    api.getConfig.mockResolvedValue({ ...baseConfig, er_roster_enabled: true })
    await userEvent.click(on)
    await waitFor(() => expect(screen.getByRole('radio', { name: 'On' })).toHaveAttribute('aria-checked', 'true'))
  })
})
