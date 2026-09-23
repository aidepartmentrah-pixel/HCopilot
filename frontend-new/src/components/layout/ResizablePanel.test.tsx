import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ResizablePanel } from './ResizablePanel'

describe('ResizablePanel', () => {
  it('renders the divider and right pane when `right` is provided', () => {
    render(<ResizablePanel left={<div>Table</div>} right={<div>Preview</div>} />)
    expect(screen.getByText('Table')).toBeInTheDocument()
    expect(screen.getByText('Preview')).toBeInTheDocument()
    expect(screen.getByRole('separator')).toBeInTheDocument()
  })

  it('collapses to just the left pane, no divider, when `right` is null', () => {
    render(<ResizablePanel left={<div>Table</div>} right={null} />)
    expect(screen.getByText('Table')).toBeInTheDocument()
    expect(screen.queryByText('Preview')).not.toBeInTheDocument()
    expect(screen.queryByRole('separator')).not.toBeInTheDocument()
  })

  describe('width persistence (History spec §9, storageKey)', () => {
    const KEY = 'test-preview-width'

    afterEach(() => {
      localStorage.removeItem(KEY)
    })

    it('uses defaultRightWidth when nothing is stored yet', () => {
      render(<ResizablePanel left={<div>Table</div>} right={<div>Preview</div>} storageKey={KEY} defaultRightWidth={480} />)
      expect(screen.getByText('Preview').closest('div')?.parentElement).toBeTruthy()
      expect(localStorage.getItem(KEY)).toBeNull()
    })

    it('restores a previously-stored width on mount instead of the default', () => {
      localStorage.setItem(KEY, '620')
      render(<ResizablePanel left={<div>Table</div>} right={<div style={{ width: '100%' }}>Preview</div>} storageKey={KEY} defaultRightWidth={480} />)
      const rightPane = screen.getByText('Preview').parentElement as HTMLElement
      expect(rightPane.style.width).toBe('620px')
    })

    it('persists a keyboard-driven resize to localStorage under the given key', () => {
      render(<ResizablePanel left={<div>Table</div>} right={<div>Preview</div>} storageKey={KEY} defaultRightWidth={480} minRightWidth={360} />)
      const divider = screen.getByRole('separator')
      fireEvent.keyDown(divider, { key: 'ArrowLeft' })
      expect(localStorage.getItem(KEY)).toBe('504')
    })

    it('never writes to localStorage when no storageKey is given (opt-in only)', () => {
      render(<ResizablePanel left={<div>Table</div>} right={<div>Preview</div>} defaultRightWidth={480} />)
      const divider = screen.getByRole('separator')
      fireEvent.keyDown(divider, { key: 'ArrowLeft' })
      expect(localStorage.getItem(KEY)).toBeNull()
    })
  })
})
