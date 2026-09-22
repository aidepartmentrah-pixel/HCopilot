/// <reference types="vitest/config" />
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 8083,
    strictPort: true,
    // Same-origin /api proxy in dev, mirroring nginx.conf's proxy_pass in
    // production (frontend/nginx.conf's own pattern) — keeps the app on one
    // consistent relative-path API convention instead of depending on CORS
    // for local dev vs. reverse-proxy for prod.
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_PROXY_TARGET ?? 'http://localhost:8090',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 8083,
    strictPort: true,
    // `vite preview` doesn't inherit `server.proxy` — Playwright's e2e
    // suite runs against a real preview build (matching what the built
    // Docker image actually serves), so this needs its own proxy entry or
    // every /api call 404s against Vite's own static file server.
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_PROXY_TARGET ?? 'http://localhost:8090',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
})
