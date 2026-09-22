import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
})
