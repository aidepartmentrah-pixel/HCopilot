import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { ToastProvider } from '@/components/feedback/ToastProvider'

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // ER/bed data goes stale fast; per-query staleTime overrides this
            // where a page needs tighter polling (§27 — tolerate slow/failed
            // responses, not "always refetch everything constantly").
            staleTime: 30_000,
            retry: 1,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>{children}</BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}
