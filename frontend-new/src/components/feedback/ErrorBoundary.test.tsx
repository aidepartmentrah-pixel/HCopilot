import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary, isChunkLoadError } from './ErrorBoundary'

function Boom({ message }: { message: string }): never {
  throw new Error(message)
}

describe('isChunkLoadError', () => {
  it.each([
    'error loading dynamically imported module: http://x/assets/LiveErPage-abc.js',
    'Failed to fetch dynamically imported module: http://x/assets/a.js',
    'Importing a module script failed.',
  ])('recognises %s', (m) => expect(isChunkLoadError(new Error(m))).toBe(true))

  it('ignores ordinary errors', () => expect(isChunkLoadError(new Error('x is undefined'))).toBe(false))
})

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows a readable message with a reload button instead of a blank page', () => {
    render(
      <ErrorBoundary>
        <Boom message="x is undefined" />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.getByText(/x is undefined/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument()
  })

  it('renders children when nothing fails', () => {
    render(
      <ErrorBoundary>
        <p>fine</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('fine')).toBeInTheDocument()
  })
})
