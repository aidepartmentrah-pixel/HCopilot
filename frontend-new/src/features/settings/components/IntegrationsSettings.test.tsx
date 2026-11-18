import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IntegrationsSettings } from './IntegrationsSettings'

const api = vi.hoisted(() => ({
  getConfig: vi.fn(),
  testErRoster: vi.fn(),
  setErRosterEnabled: vi.fn(),
  saveErConfig: vi.fn(),
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
  er_configured: true,
  er_base_url: 'http://localhost:6001/his-er/api/er/v1',
  er_api_key_masked: 'xxx_ey',
  er_api_key_error: null,
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

describe('IntegrationsSettings — ER API settings (v1.2, separate from the Directory)', () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset())
    api.getMiddleNameCandidates.mockResolvedValue({ names: [] })
  })

  it('shows the saved ER base URL and masked ER key separately from the Directory ones', async () => {
    api.getConfig.mockResolvedValue(baseConfig)
    renderPage()
    expect(await screen.findByLabelText('ER API Base URL')).toHaveValue('http://localhost:6001/his-er/api/er/v1')
    expect(screen.getByLabelText(/API Base URL/, { selector: '#hd-base-url' })).toHaveValue('http://x/api')
    expect(screen.getByText(/xxx_ey/)).toBeInTheDocument()
  })

  it('saves a new ER URL and key through the ER endpoint only', async () => {
    api.getConfig.mockResolvedValue({ ...baseConfig, er_configured: false, er_base_url: null, er_api_key_masked: null })
    api.saveErConfig.mockResolvedValue({ success: true, message: 'ER API settings saved.' })
    renderPage()
    const url = await screen.findByLabelText('ER API Base URL')
    await userEvent.type(url, 'http://meraj:8080/his-er/api/er/v1')
    await userEvent.type(screen.getByLabelText('ER API Key'), 'the-er-key')
    await userEvent.click(screen.getByRole('button', { name: 'Save ER Settings' }))
    await waitFor(() =>
      expect(api.saveErConfig).toHaveBeenCalledWith({ er_base_url: 'http://meraj:8080/his-er/api/er/v1', er_api_key: 'the-er-key' }),
    )
  })

  it('keeps the stored ER key when it is not replaced', async () => {
    api.getConfig.mockResolvedValue(baseConfig)
    api.saveErConfig.mockResolvedValue({ success: true, message: 'ok' })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Save ER Settings' }))
    await waitFor(() =>
      expect(api.saveErConfig).toHaveBeenCalledWith({ er_base_url: 'http://localhost:6001/his-er/api/er/v1', er_api_key: undefined }),
    )
  })

  it('reports a rejected ER key from the roster test', async () => {
    api.getConfig.mockResolvedValue(baseConfig)
    api.testErRoster.mockResolvedValue({ success: false, status: 'unauthorized', message: 'ER API key rejected (HTTP 401).' })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Test ER Roster' }))
    expect(await screen.findByRole('status')).toHaveTextContent('ER API key rejected')
  })
})
