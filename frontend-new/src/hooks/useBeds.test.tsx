import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAssignBed, useBedlessPatients, useBeds } from './useBeds'

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

describe('useBeds', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches the bed list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ beds: [{ bed_id: 1, bed_number: '101' }], total_beds: 1, status_summary: {} })),
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result } = renderHook(() => useBeds(), { wrapper: wrapper(queryClient) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.beds).toHaveLength(1)
  })

  it('renders an empty result set without treating it as an error (§27)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ patients: [], total: 0 })))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result } = renderHook(() => useBedlessPatients(), { wrapper: wrapper(queryClient) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.patients).toEqual([])
    expect(result.current.isError).toBe(false)
  })

  it('invalidates the bed list after a successful assignment, triggering a refetch', async () => {
    const fetchMock = vi
      .fn()
      // initial list load
      .mockResolvedValueOnce(jsonResponse({ beds: [], total_beds: 0, status_summary: {} }))
      // assign mutation
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      // refetch after invalidation
      .mockResolvedValueOnce(
        jsonResponse({ beds: [{ bed_id: 1, bed_number: '101', patient_id: 42 }], total_beds: 1, status_summary: {} }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result } = renderHook(
      () => ({ beds: useBeds(), assign: useAssignBed() }),
      { wrapper: wrapper(queryClient) },
    )

    await waitFor(() => expect(result.current.beds.isSuccess).toBe(true))
    expect(result.current.beds.data?.beds).toHaveLength(0)

    result.current.assign.mutate({ bedId: 1, patientId: 42 })

    await waitFor(() => expect(result.current.assign.isSuccess).toBe(true))
    await waitFor(() => expect(result.current.beds.data?.beds).toHaveLength(1))
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
