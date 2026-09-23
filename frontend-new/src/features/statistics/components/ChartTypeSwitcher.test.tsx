import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChartTypeSwitcher } from './ChartTypeSwitcher'

describe('ChartTypeSwitcher', () => {
  it('renders nothing when the dataset only supports one view (§9 — no symmetry-only controls)', () => {
    const { container } = render(<ChartTypeSwitcher value="donut" allowedViews={['donut']} onChange={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('only offers the dataset-valid views, not all four', async () => {
    const user = userEvent.setup()
    render(<ChartTypeSwitcher value="bar" allowedViews={['bar', 'table']} onChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /Change visualization/ }))
    expect(screen.getByRole('menuitem', { name: /Bar/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Table/ })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Donut/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Line/ })).not.toBeInTheDocument()
  })

  it('calls onChange with the selected view and closes the menu', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ChartTypeSwitcher value="bar" allowedViews={['bar', 'line', 'table']} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /Change visualization/ }))
    await user.click(screen.getByRole('menuitem', { name: /Line/ }))
    expect(onChange).toHaveBeenCalledWith('line')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
