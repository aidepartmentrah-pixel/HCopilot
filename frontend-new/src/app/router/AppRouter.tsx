import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { LoadingState } from '@/components/feedback/LoadingState'
import { HomePage } from '@/features/home/HomePage'

// Route-level code splitting: each page (ISBAR's form alone is a large,
// self-contained module) only loads when actually navigated to, instead of
// every page's code shipping in one bundle regardless of which page the
// user opens first. Home stays eager since it's the default landing route.
const IsbarPage = lazy(() => import('@/features/isbar/IsbarPage').then((m) => ({ default: m.IsbarPage })))
const LiveErPage = lazy(() => import('@/features/live-er/LiveErPage').then((m) => ({ default: m.LiveErPage })))
const HistoryPage = lazy(() => import('@/features/history/HistoryPage').then((m) => ({ default: m.HistoryPage })))
const FullRecordPage = lazy(() => import('@/features/history/FullRecordPage').then((m) => ({ default: m.FullRecordPage })))
const StatisticsPage = lazy(() => import('@/features/statistics/StatisticsPage').then((m) => ({ default: m.StatisticsPage })))
const PredictionsPage = lazy(() => import('@/features/predictions/PredictionsPage').then((m) => ({ default: m.PredictionsPage })))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))

function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingState label="Loading page…" />}>{children}</Suspense>
}

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route
          path="isbar"
          element={
            <LazyPage>
              <IsbarPage />
            </LazyPage>
          }
        />
        <Route
          path="live-er"
          element={
            <LazyPage>
              <LiveErPage />
            </LazyPage>
          }
        />
        <Route
          path="history"
          element={
            <LazyPage>
              <HistoryPage />
            </LazyPage>
          }
        />
        <Route
          path="history/:stayId"
          element={
            <LazyPage>
              <FullRecordPage />
            </LazyPage>
          }
        />
        <Route
          path="statistics"
          element={
            <LazyPage>
              <StatisticsPage />
            </LazyPage>
          }
        />
        <Route
          path="predictions"
          element={
            <LazyPage>
              <PredictionsPage />
            </LazyPage>
          }
        />
        <Route
          path="settings"
          element={
            <LazyPage>
              <SettingsPage />
            </LazyPage>
          }
        />
      </Route>
    </Routes>
  )
}
