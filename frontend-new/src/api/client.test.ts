import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient, ApiError } from './client'

describe('apiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses a successful JSON response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ total: 2 }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await apiClient.get<{ total: number }>('/api/patients/list')

    expect(result).toEqual({ total: 2 })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/patients/list',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('throws ApiError with the real status and body text on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Stay ID 5 not found', { status: 404, statusText: 'Not Found' })),
    )

    await expect(apiClient.get('/api/patients/5/details')).rejects.toMatchObject({
      status: 404,
      message: 'Stay ID 5 not found',
    })
  })

  it('is an instance of ApiError, distinguishable from a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })))
    await expect(apiClient.get('/api/beds/list')).rejects.toBeInstanceOf(ApiError)
  })

  it('returns undefined for a 204 response instead of failing to parse empty JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await expect(apiClient.delete('/api/beds/delete/1')).resolves.toBeUndefined()
  })

  it('serializes the body and sends it on POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await apiClient.post('/api/patients/add', { patient_id: 1, name: 'Chen, Marcus' })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/patients/add',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ patient_id: 1, name: 'Chen, Marcus' }) }),
    )
  })
})
