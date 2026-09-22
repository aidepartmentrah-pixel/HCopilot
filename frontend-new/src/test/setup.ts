import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// vitest.config's `test.globals` is intentionally left off (avoids extra
// tsconfig "types" wiring) — but that means @testing-library/react's own
// auto-cleanup, which detects globals, never registers. Without this,
// each render() leaks into the next test's DOM within the same file.
afterEach(() => {
  cleanup()
})

// jsdom (as of the version this project pulled in) doesn't implement
// HTMLDialogElement.showModal()/close() — real browsers do. Polyfill just
// enough of the reflected `open` attribute behavior for ConfirmDialog's
// tests; production code keeps using the real API unmodified.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
}
if (!HTMLDialogElement.prototype.close) {
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}
